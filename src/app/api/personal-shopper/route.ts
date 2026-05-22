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

  // Janela de lookback para tarefas pendentes de dias anteriores (30 dias)
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - 30);
  lookbackStart.setHours(0, 0, 0, 0);

  // Quando admin seleciona uma data específica, usa filtro direto.
  // No modo normal (PS vendo as próprias tarefas), inclui:
  //   1. Todas as tarefas de hoje (qualquer status)
  //   2. Tarefas PENDENTES de dias anteriores (últimos 30 dias)
  const dateFilter = dateParam
    ? { createdAt: { gte: filterDate } }
    : {
        OR: [
          { createdAt: { gte: todayStart } },
          { status: "PENDENTE" as const, createdAt: { gte: lookbackStart, lt: todayStart } },
        ],
      };

  const tasks = await db.task.findMany({
    where: {
      title: { startsWith: PS_PREFIX },
      ...(effectiveAssignedToId ? { assignedToId: effectiveAssignedToId } : {}),
      ...dateFilter,
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
    excludeOrdersAfter?: string;    // ISO date — exclui quem comprou APÓS essa data
    minTotalSpent?: number;
    minRfmScore?: number;
    states?: string[];
    boughtProducts?: string[];      // palavras-chave: inclui só quem JÁ comprou esses produtos
    notBoughtProducts?: string[];   // palavras-chave: exclui quem JÁ comprou esses produtos
  }
  let promptFilters: PromptFilters = {};
  let promptParseError: string | null = null;

  if (promptText) {
    // 1. Tenta Claude para interpretação semântica completa
    try {
      const today = new Date().toISOString().split("T")[0];
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `Você é um assistente de CRM de moda praia. Hoje é ${today}. Interprete o pedido abaixo e retorne SOMENTE um JSON com os filtros de seleção de clientes, sem texto adicional.

Pedido: "${promptText}"

Campos disponíveis (todos opcionais):
- segments: array com valores de CustomerSegment (VIP, ALTO_POTENCIAL, RECORRENTE, EM_RISCO, INATIVO, NOVO, PRIMEIRA_COMPRA)
- minDaysSinceOrder: número mínimo de dias desde a última compra
- maxDaysSinceOrder: número máximo de dias desde a última compra
- excludeOrdersAfter: data ISO "YYYY-MM-DD" — exclui quem comprou APÓS essa data. Para "retire quem comprou em maio de 2026" → "2026-05-01". Para "este mês" → primeiro dia do mês atual.
- minTotalSpent: valor mínimo gasto total em reais
- minRfmScore: score RFM mínimo (1-12). "bom potencial" = 6, "alto RFM" = 8
- states: array de siglas de estados brasileiros
- boughtProducts: array de FRASES COMPLETAS de produto para buscar no histórico de compras — inclui APENAS clientes que já compraram produtos com essas frases no título. NUNCA separe palavras de um mesmo produto.
- notBoughtProducts: array de FRASES COMPLETAS — exclui clientes que já compraram esses produtos.

Regras CRÍTICAS para produtos:
- Mantenha o nome completo do produto como UMA frase: "calcinha nina" → ["calcinha nina"], "top alana" → ["top alana"], "vestido sofie" → ["vestido sofie"]
- NUNCA separe em palavras individuais. ERRADO: ["top","nina"]. CERTO: ["top nina"]
- Se mencionar vários produtos: "calcinha nina e top alana" → ["calcinha nina","top alana"]
- "que compraram top nina" → boughtProducts: ["top nina"]
- "que não compraram calcinha alana" → notBoughtProducts: ["calcinha alana"]
- "retire quem comprou em maio" → excludeOrdersAfter com o 1º dia do mês
- "não compra há mais de X dias" → minDaysSinceOrder: X
- Retorne apenas o JSON, sem markdown.

Exemplo: {"minDaysSinceOrder":90,"boughtProducts":["top nina","vestido sofie"],"notBoughtProducts":["calcinha alana"],"minRfmScore":6}`,
        }],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
      promptFilters = JSON.parse(text.replace(/```json|```/g, "").trim());
      console.log("[PS IA] Claude extraiu:", JSON.stringify(promptFilters));
    } catch (err) {
      promptParseError = err instanceof Error ? err.message : String(err);
      console.error("[PS IA] Claude falhou, usando regex fallback:", promptParseError);
    }

    // 2. Regex fallback — garante extração dos campos mais comuns mesmo sem Claude
    const p = promptText.toLowerCase();

    // dias sem comprar
    if (!promptFilters.minDaysSinceOrder) {
      const m = p.match(/(\d+)\s*dias?\s*(sem|sem compra|sem comprar|não compra|nao compra|há|ha)/);
      if (m) promptFilters.minDaysSinceOrder = parseInt(m[1]);
    }

    // excluir mês específico
    if (!promptFilters.excludeOrdersAfter) {
      const meses: Record<string, string> = {
        janeiro:"01",fevereiro:"02",março:"03",marco:"03",abril:"04",maio:"05",
        junho:"06",julho:"07",agosto:"08",setembro:"09",outubro:"10",novembro:"11",dezembro:"12",
      };
      for (const [nome, num] of Object.entries(meses)) {
        if (p.includes(nome)) {
          const yearMatch = p.match(/20\d\d/);
          const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
          promptFilters.excludeOrdersAfter = `${year}-${num}-01`;
          break;
        }
      }
    }

    // produtos comprados — padrão: "compraram/comprou/que têm/levaram [termo]"
    if (!promptFilters.boughtProducts?.length) {
      const bought = p.match(/(?:compraram?|que\s+t[eê]m?|levaram?|do\s+produto)\s+([a-záéíóúâêîôûãõçàè\s]+?)(?:\s+e\s+(?:n[aã]o\s+)?|\s*,|\s*$)/g);
      if (bought?.length) {
        promptFilters.boughtProducts = bought.map((m) =>
          m.replace(/compraram?|que\s+t[eê]m?|levaram?|do\s+produto/g, "").trim()
        ).filter(Boolean);
      }
    }

    // produtos NÃO comprados — padrão: "não compraram/sem [termo]"
    if (!promptFilters.notBoughtProducts?.length) {
      const notBought = p.match(/(?:n[aã]o\s+compraram?|sem\s+(?:o\s+produto\s+)?)\s+([a-záéíóúâêîôûãõçàè\s]+?)(?:\s+e\s+|\s*,|\s*$)/g);
      if (notBought?.length) {
        promptFilters.notBoughtProducts = notBought.map((m) =>
          m.replace(/n[aã]o\s+compraram?|sem\s+(?:o\s+produto\s+)?/g, "").trim()
        ).filter(Boolean);
      }
    }

    console.log("[PS IA] Filtros finais (após fallback):", JSON.stringify(promptFilters));
  }

  console.log("[PS IA] promptFilters extraídos:", JSON.stringify(promptFilters));

  // Resolver IDs de clientes com base em histórico de compras (via orders → lineItems)
  let mustIncludeIds: string[] | null = null;   // null = sem restrição; [] = nenhum encontrado
  let mustExcludeFromProductIds: string[] = [];

  if (promptFilters.boughtProducts?.length) {
    const orders = await db.order.findMany({
      where: {
        lineItems: {
          some: {
            OR: promptFilters.boughtProducts.map((kw) => ({
              title: { contains: kw, mode: "insensitive" as const },
            })),
          },
        },
      },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    mustIncludeIds = orders.map((o) => o.customerId);
    console.log(`[PS IA] boughtProducts ${JSON.stringify(promptFilters.boughtProducts)} → ${mustIncludeIds.length} clientes encontrados`);
  }

  if (promptFilters.notBoughtProducts?.length) {
    const orders = await db.order.findMany({
      where: {
        lineItems: {
          some: {
            OR: promptFilters.notBoughtProducts.map((kw) => ({
              title: { contains: kw, mode: "insensitive" as const },
            })),
          },
        },
      },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    mustExcludeFromProductIds = orders.map((o) => o.customerId);
    console.log(`[PS IA] notBoughtProducts ${JSON.stringify(promptFilters.notBoughtProducts)} → ${mustExcludeFromProductIds.length} clientes a excluir`);
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

  // Se o prompt pedir para excluir quem comprou após determinada data,
  // o teto do lastOrderAt é o menor entre winBackTo e excludeOrdersAfter
  const excludeAfterDate = promptFilters.excludeOrdersAfter
    ? new Date(promptFilters.excludeOrdersAfter)
    : null;
  const effectiveUpperBound = excludeAfterDate && excludeAfterDate < winBackTo
    ? excludeAfterDate
    : winBackTo;

  // Filtros de data reutilizáveis em ambos os pools
  const lastOrderAtFilter = {
    gte: winBackFrom,
    lt: effectiveUpperBound,
  };

  // Filtros extras comuns
  const extraFilters = {
    ...(promptFilters.segments?.length ? { segment: { in: promptFilters.segments as never[] } } : {}),
    ...(promptFilters.minTotalSpent ? { totalSpent: { gte: promptFilters.minTotalSpent } } : {}),
    ...(promptFilters.states?.length ? { state: { in: promptFilters.states } } : {}),
  };

  // Combina todos os IDs a excluir: cooldown + outros PS + produtos proibidos
  const allExcludeIds = [...new Set([...excludeIds, ...mustExcludeFromProductIds])];

  // Filtro de ID: restringe a quem comprou produto específico (se houver)
  // e exclui quem não deve entrar
  function buildIdFilter(extraExclude: string[] = []) {
    const excluded = [...new Set([...allExcludeIds, ...extraExclude])];
    if (mustIncludeIds !== null) {
      // Só aceita quem está na lista de comprou-produto E não está excluído
      const allowed = mustIncludeIds.filter((id) => !excluded.includes(id));
      return allowed.length > 0 ? { in: allowed } : { in: ["__none__"] };
    }
    return excluded.length > 0 ? { notIn: excluded } : undefined;
  }

  const poolA = await db.customer.findMany({
    where: {
      phone: { not: null },
      lastOrderAt: lastOrderAtFilter,
      ...extraFilters,
      AND: [
        {
          OR: [
            { fidelized: false },
            { assignedShopperId: targetUserId },
          ],
        },
      ],
      id: buildIdFilter(),
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
      lastOrderAt: lastOrderAtFilter,
      id: buildIdFilter(poolAIds),
    },
    select: { id: true, firstName: true, lastName: true, segment: true, rfmScore: true },
  });

  const allPoolAIds = [...poolAIds, ...fidelizedToTarget.map((c) => c.id)];
  const poolBExclude = allPoolAIds;

  // Pool B: alto RFM — agora TAMBÉM respeita o filtro de lastOrderAt
  // para não trazer clientes que compraram recentemente
  const poolB = await db.customer.findMany({
    where: {
      phone: { not: null },
      rfmScore: { gte: promptFilters.minRfmScore ?? RFM_THRESHOLD },
      lastOrderAt: lastOrderAtFilter,
      ...extraFilters,
      AND: [
        {
          OR: [
            { fidelized: false },
            { assignedShopperId: targetUserId },
          ],
        },
      ],
      id: buildIdFilter(poolBExclude),
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
    extractedFilters: promptFilters,
    productMatchCount: mustIncludeIds !== null ? mustIncludeIds.length : null,
    promptParseError,
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
