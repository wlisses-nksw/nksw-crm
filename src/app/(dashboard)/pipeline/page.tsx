import { Header } from "@/components/layout/header";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

async function getPipeline() {
  // Garante que existe um pipeline padrão
  let pipeline = await db.pipeline.findFirst({
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
  });

  if (!pipeline) {
    pipeline = await db.pipeline.create({
      data: {
        name: "Pipeline Principal",
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
      include: {
        stages: {
          orderBy: { order: "asc" },
          include: {
            cards: {
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
    });
  }

  return pipeline;
}

export default async function PipelinePage() {
  const pipeline = await getPipeline();

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title={pipeline.name}
        actions={
          <Button size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Novo Card
          </Button>
        }
      />
      <div className="flex-1 overflow-hidden">
        <KanbanBoard pipeline={pipeline as Parameters<typeof KanbanBoard>[0]["pipeline"]} />
      </div>
    </div>
  );
}
