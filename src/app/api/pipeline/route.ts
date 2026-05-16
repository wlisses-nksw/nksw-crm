import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const pipelines = await db.pipeline.findMany({
    where: { active: true },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          cards: {
            orderBy: { order: "asc" },
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
                  ordersCount: true,
                  lastOrderAt: true,
                  shopifyId: true,
                  assignedShopperId: true,
                  engagementScore: true,
                  city: true,
                  state: true,
                  createdAt: true,
                },
              },
            },
          },
          _count: { select: { cards: true } },
        },
      },
    },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ data: pipelines });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { name, description } = await req.json();

  const pipeline = await db.pipeline.create({
    data: {
      name,
      description,
      stages: {
        createMany: {
          data: [
            { name: "Novo Lead", color: "#6366f1", order: 0 },
            { name: "Em Atendimento", color: "#3b82f6", order: 1 },
            { name: "Interessado", color: "#f59e0b", order: 2 },
            { name: "Aguardando Retorno", color: "#8b5cf6", order: 3 },
            { name: "Compra Realizada", color: "#10b981", order: 4, isWon: true },
            { name: "Pós Venda", color: "#06b6d4", order: 5 },
            { name: "Cliente VIP", color: "#f43f5e", order: 6 },
          ],
        },
      },
    },
  });

  return NextResponse.json({ data: pipeline }, { status: 201 });
}
