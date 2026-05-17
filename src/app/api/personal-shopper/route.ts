import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const PS_PREFIX = "PS |";
const BATCH_SIZE = 100;
const COOLDOWN_DAYS = 30;

// GET — busca o lote ativo de hoje (ou cria se não existe)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const tasks = await db.task.findMany({
    where: {
      title: { startsWith: PS_PREFIX },
      createdAt: { gte: todayStart },
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

  return NextResponse.json({ data: tasks, total: tasks.length });
}

// POST — gera novo lote de clientes
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const forceNew = body?.forceNew === true;

  // Se já tem lote hoje e não é forçar novo, retorna erro
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (!forceNew) {
    const existing = await db.task.count({
      where: { title: { startsWith: PS_PREFIX }, createdAt: { gte: todayStart } },
    });
    if (existing > 0) {
      return NextResponse.json({ error: "Lote já gerado hoje. Use forceNew=true para carregar mais." }, { status: 409 });
    }
  }

  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - COOLDOWN_DAYS);

  // Clientes recentemente contactados via PS
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

  // Seleciona clientes com maior propensão de compra
  const customers = await db.customer.findMany({
    where: {
      phone: { not: null },
      id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
    },
    orderBy: [
      { rfmScore: "desc" },
      { totalSpent: "desc" },
    ],
    take: BATCH_SIZE,
    select: { id: true, firstName: true, lastName: true, segment: true, rfmScore: true },
  });

  if (customers.length === 0) {
    return NextResponse.json({ error: "Nenhum cliente disponível para contato." }, { status: 404 });
  }

  // Mapeia segmento → prioridade
  const segmentPriority = (segment: string) => {
    if (["VIP", "ALTO_POTENCIAL"].includes(segment)) return "ALTA";
    if (["RECORRENTE", "PRIMEIRA_COMPRA"].includes(segment)) return "MEDIA";
    return "BAIXA";
  };

  const tasks = await db.$transaction(
    customers.map((c) =>
      db.task.create({
        data: {
          title: `${PS_PREFIX} ${c.firstName} ${c.lastName}`,
          type: "WHATSAPP",
          status: "PENDENTE",
          priority: segmentPriority(c.segment) as never,
          customerId: c.id,
          assignedToId: session.user.id,
          createdById: session.user.id,
          dueAt: new Date(),
        },
      })
    )
  );

  return NextResponse.json({ ok: true, generated: tasks.length }, { status: 201 });
}
