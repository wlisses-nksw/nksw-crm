"use client";

import { useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { toast } from "sonner";
import Link from "next/link";
import { MoreHorizontal, Crown } from "lucide-react";
import { ScoreBadge } from "@/components/shared/score-badge";
import { formatCurrency, formatRelative } from "@/lib/utils";
import type { PipelineWithStages, KanbanColumn, CustomerSummary } from "@/types";
import type { PipelineCard } from "@prisma/client";

interface KanbanBoardProps {
  pipeline: PipelineWithStages;
}

type CardWithCustomer = PipelineCard & { customer: CustomerSummary };

export function KanbanBoard({ pipeline }: KanbanBoardProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>(
    pipeline.stages as KanbanColumn[]
  );

  async function onDragEnd(result: DropResult) {
    const { draggableId, source, destination } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) return;

    // Atualiza localmente primeiro (optimistic)
    const newColumns = columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const sourceCol = newColumns.find((c) => c.id === source.droppableId)!;
    const destCol = newColumns.find((c) => c.id === destination.droppableId)!;

    const [movedCard] = sourceCol.cards.splice(source.index, 1);
    destCol.cards.splice(destination.index, 0, movedCard);

    // Re-index order
    destCol.cards.forEach((c, i) => { (c as unknown as { order: number }).order = i; });

    setColumns(newColumns);

    // Persiste
    try {
      const res = await fetch("/api/pipeline/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          cardId: draggableId,
          stageId: destination.droppableId,
          order: destination.index,
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Rollback
      setColumns(pipeline.stages as KanbanColumn[]);
      toast.error("Erro ao mover card");
    }
  }

  const totalCards = columns.reduce((s, c) => s + c.cards.length, 0);

  return (
    <div className="h-full overflow-x-auto">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 p-6 h-full min-w-max">
          {columns.map((column) => (
            <div key={column.id} className="flex flex-col w-72 shrink-0">
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                  <span className="text-sm font-medium">{column.name}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {column.cards.length}
                  </span>
                </div>
                {column.isWon && <Crown className="w-3.5 h-3.5 text-amber-500" />}
              </div>

              {/* Droppable area */}
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 rounded-xl p-2 space-y-2 min-h-24 transition-colors ${
                      snapshot.isDraggingOver
                        ? "bg-primary/5 border-2 border-dashed border-primary/30"
                        : "bg-muted/30"
                    }`}
                  >
                    {column.cards.map((card, index) => (
                      <DraggableCard
                        key={card.id}
                        card={card as CardWithCustomer}
                        index={index}
                        stageColor={column.color}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

function DraggableCard({
  card,
  index,
  stageColor,
}: {
  card: CardWithCustomer;
  index: number;
  stageColor: string;
}) {
  const c = card.customer;

  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-shadow ${
            snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : "hover:shadow-md"
          }`}
        >
          {/* Cliente */}
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/customers/${c.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 flex-1 min-w-0 hover:text-primary transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">
                {c.firstName?.charAt(0) ?? "?"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  {c.firstName} {c.lastName}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>
              </div>
            </Link>
            <button className="text-muted-foreground hover:text-foreground shrink-0 p-0.5">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card title */}
          {card.title !== `${c.firstName} ${c.lastName}` && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{card.title}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3">
            <ScoreBadge segment={c.segment} />
            {card.value && (
              <span className="text-xs font-semibold text-foreground">
                {formatCurrency(Number(card.value))}
              </span>
            )}
          </div>

          {c.lastOrderAt && (
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              Última compra {formatRelative(c.lastOrderAt)}
            </p>
          )}
        </div>
      )}
    </Draggable>
  );
}
