import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const moveSchema = z.object({
  cardId: z.string(),
  stageId: z.string(),
  order: z.number(),
});

const createSchema = z.object({
  stageId: z.string(),
  customerId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  value: z.number().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();

  // Mover card (drag and drop)
  if (body.action === "move") {
    const parsed = moveSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

    const { cardId, stageId, order } = parsed.data;

    const stage = await db.pipelineStage.findUniqueOrThrow({
      where: { id: stageId },
    });

    const card = await db.pipelineCard.update({
      where: { id: cardId },
      data: {
        stageId,
        order,
        ...(stage.isWon ? { wonAt: new Date() } : {}),
        ...(stage.isLost ? { lostAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ data: card });
  }

  // Criar card
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const card = await db.pipelineCard.create({
    data: parsed.data,
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          segment: true,
          rfmScore: true,
          totalSpent: true,
          city: true,
          state: true,
          createdAt: true,
          lastOrderAt: true,
          ordersCount: true,
          shopifyId: true,
          rfmLabel: true,
          assignedShopperId: true,
          engagementScore: true,
          phone: true,
        },
      },
    },
  });

  return NextResponse.json({ data: card }, { status: 201 });
}
