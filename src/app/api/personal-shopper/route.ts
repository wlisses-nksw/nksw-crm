import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
  const effectiveAssignedToId =
    session.user.role === "ADMIN" || session.user.role === "SUPERVISOR"
      ? assignedToId ?? undefined
      : session.user.id;

  const tasks = await db.task.findMany({
    where: {
      title: { startsWith: PS_PREFIX },
      createdAt: { gte: todayStart },
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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

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

  const excludeIds = recentlyContacted
    .map((t) => t.customerId)
    .filter(Boolean) as string[];

  const now = new Date();
  const winBackFrom = new Date(now);
  winBackFrom.setDate(winBackFrom.getDate() - WIN_BACK_MAX_DAYS);
  const winBackTo = new Date(now);
  winBackTo.setDate(winBackTo.getDate() - WIN_BACK_MIN_DAYS);

  const poolA = await db.customer.findMany({
    where: {
      phone: { not: null },
      lastOrderAt: { gte: winBackFrom, lte: winBackTo },
      id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
    },
    orderBy: { totalSpent: "desc" },
    take: POOL_A_SIZE,
    select: { id: true, firstName: true, lastName: true, segment: true, rfmScore: true },
  });

  const poolAIds = poolA.map((c) => c.id);
  const poolBExclude = [...excludeIds, ...poolAIds];

  const poolB = await db.customer.findMany({
    where: {
      phone: { not: null },
      rfmScore: { gte: RFM_THRESHOLD },
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
          dueAt: new Date(),
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

// DELETE — limpa tasks PS de hoje (admin only)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const assignedToId = req.nextUrl.searchParams.get("assignedToId");
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
