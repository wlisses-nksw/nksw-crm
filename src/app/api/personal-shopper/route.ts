import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const PS_PREFIX = "PS |";
const COOLDOWN_DAYS = 30;
const POOL_A_SIZE = 60;
const POOL_B_SIZE = 40;
const WIN_BACK_MIN_DAYS = 90;
const WIN_BACK_MAX_DAYS = 365;
const RFM_THRESHOLD = 6;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const assignedToId = req.nextUrl.searchParams.get("assignedToId");
  const dateParam = req.nextUrl.searchParams.get("date");
  const filterDate = dateParam ? new Date(dateParam) : todayStart;
  filterDate.setHours(0, 0, 0, 0);

  const effectiveAssignedToId =
    session.user.role === "ADMIN" || session.user.role === "SUPERVISOR"
      ? assignedToId ?? undefined
      : session.user.id;

  const tasks = await db.task.findMany({
    where: {
      title: { startsWith: PS_PREFIX },
      createdAt: { gte: filterDate },
      ...(effectiveAssignedToId ? { assignedToId: effectiveAssignedToId } : {}),
    },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          segment: true,
          rfmScore: true,
          rfmLabel: true,
          totalSpent: true,
          lastOrderAt: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const poolWinback = tasks.filter((t) => t.description?.includes("pool:winback")).length;
  const poolRfm = tasks.filter((t) => t.description?.includes("pool:rfm")).length;

  return NextResponse.json({
    data: tasks,
    total: tasks.length,
    pools: { winback: poolWinback, rfm: poolRfm },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const forceNew = body?.forceNew === true;
  const targetUserId: string = body?.assignedToId ?? session.user.id;
  const dateParam: string | undefined = body?.date;
  const promptText: string | undefined = body?.prompt;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dueAtDate = dateParam ? new Date(dateParam) : new Date();

  // Interpretar prompt via Claude se fornecido
  interface PromptFilters {
    segments?: string[];
    minDaysSinceOrder?: number;
    maxDaysSinceOrder?: number;
    minTotalSpent?: number;
    minRfmScore?: number;
    states?: string[];
  }
  let promptFilters: PromptFilters = {};
  if (promptText) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: `Você é um assistente de CRM. Interprete o seguinte pedido e retorne SOMENTE um JSON com os filtros de seleção de clientes, sem texto adicional.

Pedido: "${promptText}"

Campos disponíveis (todos opcionais):
- segments: array com valores de CustomerSegment (VIP, ALTO_POTENCIAL, RECORRENTE, EM_RISCO, INATIVO, NOVO, PRIMEIRA_COMPRA)
- minDaysSinceOrder: número mínimo de dias desde a última compra
- maxDaysSinceOrder: número máximo de dias desde a última compra
- minTotalSpent: valor mínimo gasto total (em reais)
- minRfmScore: score RFM mínimo (1-12)
- states: array de siglas de estados brasileiros (ex: ["SP", "RJ"])

Retorne apenas o JSON, ex: {"segments":["VIP"],"minDaysSinceOrder":30}`
        }],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
      promptFilters = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      // Se falhar, ignora o prompt e usa filtros padrão
    }
  }

  if (!forceNew) {
    const existing = await db.task.count({
      where: { title: { startsWith: PS_PREFIX }, createdAt: { gte: todayStart }, assignedToId: targetUserId },
    });
    if (existing > 0) {
      return NextResponse.json({ error: "Lote já gerado hoje. Use forceNew=true para carregar mais." }, { status: 409 });
    }
  }

  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

  const recentlyContacted = await db.task.findMany({
    where: {
      title: { startsWith: PS_PREFIX },
      createdAt: { gte: cooldownDate },
      customerId: { not: null },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });

  // Clientes já em lote ativo de OUTRO PS hoje
  const todayBatchOthers = await db.task.findMany({
    where: {
      title: { startsWith: PS_PREFIX },
      createdAt: { gte: todayStart },
      assignedToId: { not: targetUserId },
      customerId: { not: null },
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const todayOtherIds = todayBatchOthers.map((t) => t.customerId).filter(Boolean) as string[];

  const excludeIds = [
    ...recentlyContacted.map((t) => t.customerId).filter(Boolean) as string[],
    ...todayOtherIds,
  ];

  const now = new Date();
  // Permite sobrescrever range de dias via prompt
  const winBackMaxDays = promptFilters.maxDaysSinceOrder ?? WIN_BACK_MAX_DAYS;
  const winBackMinDays = promptFilters.minDaysSinceOrder ?? WIN_BACK_MIN_DAYS;
  const winBackFrom = new Date(now);
  winBackFrom.setDate(winBackFrom.getDate() - winBackMaxDays);
  const winBackTo = new Date(now);
  winBackTo.setDate(winBackTo.getDate() - winBackMinDays);

  const poolA = await db.customer.findMany({
    where: {
      phone: { not: null },
      lastOrderAt: { gte: winBackFrom, lte: winBackTo },
      ...(promptFilters.segments?.length ? { segment: { in: promptFilters.segments as never[] } } : {}),
      ...(promptFilters.minTotalSpent ? { totalSpent: { gte: promptFilters.minTotalSpent } } : {}),
      ...(promptFilters.states?.length ? { state: { in: promptFilters.states } } : {}),
      AND: [
        {
          OR: [
            { fidelized: false },
            { assignedShopperId: targetUserId },
          ],
        },
      ],
      id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
    },
    orderBy: { totalSpent: "desc" },
    take: POOL_A_SIZE,
    select: { id: true, firstName: true, lastName: true, segment: true, rfmScore: true },
  });

  const poolAIds = poolA.map((c) => c.id);

  // Inclui clientes fidelizados ao targetUserId com lastOrderAt no range
  const fidelizedToTarget = await db.customer.findMany({
    where: {
      fidelized: true,
      assignedShopperId: targetUserId,
      lastOrderAt: { gte: winBackFrom, lte: winBackTo },
      id: { notIn: [...excludeIds, ...poolAIds] },
    },
    select: { id: true, firstName: true, lastName: true, segment: true, rfmScore: true },
  });

  const allPoolAIds = [...poolAIds, ...fidelizedToTarget.map((c) => c.id)];
  const poolBExclude = [...excludeIds, ...allPoolAIds];

  const poolB = await db.customer.findMany({
    where: {
      phone: { not: null },
      rfmScore: { gte: promptFilters.minRfmScore ?? RFM_THRESHOLD },
      ...(promptFilters.segments?.length ? { segment: { in: promptFilters.segments as never[] } } : {}),
      ...(promptFilters.minTotalSpent ? { totalSpent: { gte: promptFilters.minTotalSpent } } : {}),
      ...(promptFilters.states?.length ? { state: { in: promptFilters.states } } : {}),
      AND: [
        {
          OR: [
            { fidelized: false },
            { assignedShopperId: targetUserId },
          ],
        },
      ],
      id: poolBExclude.length > 0 ? { notIn: poolBExclude } : undefined,
    },
    orderBy: { rfmScore: "desc" },
    take: POOL_B_SIZE,
    select: { id: true, firstName: true, lastName: true, segment: true, rfmScore: true },
  });

  const segmentPriority = (segment: string) => {
    if (["VIP", "ALTO_POTENCIAL"].includes(segment)) return "ALTA";
    if (["RECORRENTE", "PRIMEIRA_COMPRA"].includes(segment)) return "MEDIA";
    return "BAIXA";
  };

  const allCustomers = [
    ...poolA.map((c) => ({ ...c, pool: "winback" as const })),
    ...fidelizedToTarget.map((c) => ({ ...c, pool: "winback" as const })),
    ...poolB.map((c) => ({ ...c, pool: "rfm" as const })),
  ];

  if (allCustomers.length === 0) {
    return NextResponse.json({ error: "Nenhum cliente disponível para contato." }, { status: 404 });
  }

  const tasks = await db.$transaction(
    allCustomers.map((c) =>
      db.task.create({
        data: {
          title: `${PS_PREFIX} ${c.firstName} ${c.lastName}`,
          description: `pool:${c.pool}`,
          type: "WHATSAPP",
          status: "PENDENTE",
          priority: segmentPriority(c.segment) as never,
          customerId: c.id,
          assignedToId: targetUserId,
          createdById: session.user.id,
          dueAt: dueAtDate,
        },
      })
    )
  );

  return NextResponse.json({
    ok: true,
    generated: tasks.length,
    pools: { winback: poolA.length, rfm: poolB.length },
  }, { status: 201 });
}

// DELETE — limpa tasks PS de hoje (ADMIN e SUPERVISOR podem limpar; PERSONAL_SHOPPER não pode)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const role = session.user.role;
  if (role === "PERSONAL_SHOPPER") {
    return NextResponse.json({ error: "Sem permissão para limpar registros" }, { status: 403 });
  }

  const isAdmin = role === "ADMIN";
  const assignedToIdParam = req.nextUrl.searchParams.get("assignedToId");

  // Supervisor pode limpar qualquer PS (igual ao admin)
  const assignedToId = (isAdmin || role === "SUPERVISOR") ? (assignedToIdParam ?? undefined) : undefined;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await db.task.deleteMany({
    where: {
      title: { startsWith: PS_PREFIX },
      createdAt: { gte: todayStart },
      ...(assignedToId ? { assignedToId } : {}),
    },
  });

  return NextResponse.json({ ok: true, deleted: count });
}
