import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { TaskType, TaskPriority, TaskStatus } from "@prisma/client";

const createSchema = z.object({
  customerId: z.string().optional(),
  assignedToId: z.string(),
  type: z.nativeEnum(TaskType),
  priority: z.nativeEnum(TaskPriority).default("MEDIA"),
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const customerId = sp.get("customerId");
  const assignedToId = sp.get("assignedToId");
  const status = sp.get("status") as TaskStatus | null;
  const dueDate = sp.get("dueDate");
  const page = parseInt(sp.get("page") ?? "1");

  const where: Record<string, unknown> = {
    ...(customerId && { customerId }),
    ...(assignedToId && { assignedToId }),
    ...(status ? { status } : { status: { not: "CANCELADA" as TaskStatus } }),
  };

  if (dueDate) {
    const start = new Date(dueDate + "T00:00:00");
    const end = new Date(dueDate + "T23:59:59");
    where.dueAt = { gte: start, lte: end };
  }

  const [total, tasks] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, name: true, image: true } },
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
      skip: (page - 1) * 30,
      take: 30,
    }),
  ]);

  return NextResponse.json({ data: tasks, total, page });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const task = await db.task.create({
    data: {
      ...parsed.data,
      createdById: session.user.id,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
