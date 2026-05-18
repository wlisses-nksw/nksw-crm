"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskType } from "@prisma/client";

interface Props {
  customerId: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TASK_TYPES: { label: string; value: TaskType }[] = [
  { label: "Follow-up", value: "FOLLOW_UP" },
  { label: "WhatsApp", value: "WHATSAPP" },
  { label: "Ligação", value: "LIGACAO" },
  { label: "Email", value: "EMAIL" },
  { label: "Lembrete", value: "LEMBRETE" },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export function ScheduleTaskModal({ customerId, customerName, open, onClose, onSuccess }: Props) {
  const { data: session } = useSession();
  const [type, setType] = useState<TaskType>("FOLLOW_UP");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Título obrigatório"); return; }
    if (!date) { toast.error("Data obrigatória"); return; }
    if (!session?.user?.id) { toast.error("Sessão inválida"); return; }

    const dueAt = new Date(`${date}T${time || "09:00"}:00`);

    setLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          assignedToId: session.user.id,
          type,
          priority: "MEDIA",
          title: title.trim(),
          description: notes.trim() || undefined,
          dueAt: dueAt.toISOString(),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? "Erro ao agendar tarefa");
        return;
      }

      toast.success("Tarefa agendada!");
      setTitle("");
      setNotes("");
      setDate(todayStr());
      setTime("09:00");
      setType("FOLLOW_UP");
      onSuccess();
      onClose();
    } catch {
      toast.error("Erro ao agendar tarefa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-background border border-border rounded-xl shadow-xl p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold">Agendar tarefa</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Data e Horário */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Data <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Horário</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Título <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Oferecer nova coleção..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações adicionais..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Agendando..." : "Agendar tarefa"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
