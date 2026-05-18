"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  User,
  Calendar,
} from "lucide-react";
import { formatDate, formatRelative } from "@/lib/utils";
import type { TaskStatus, TaskPriority, TaskType } from "@prisma/client";
import Link from "next/link";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: Date | null;
  completedAt?: Date | null;
  customer?: { id: string; firstName: string; lastName: string; email: string } | null;
  assignedTo: { id: string; name: string | null; image: string | null };
}

const STATUS_FILTERS = [
  { value: "", label: "Todas" },
  { value: "PENDENTE", label: "Pendentes" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "CONCLUIDA", label: "Concluídas" },
];

const PRIORITY_ICON: Record<TaskPriority, React.ReactNode> = {
  URGENTE: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
  ALTA: <AlertCircle className="w-3.5 h-3.5 text-orange-500" />,
  MEDIA: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  BAIXA: <Circle className="w-3.5 h-3.5 text-gray-400" />,
};

export function TasksView() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: Task[]; total: number }>({
    queryKey: ["tasks", statusFilter, dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter) params.set("dueDate", dateFilter);
      const res = await fetch(`/api/tasks?${params}`);
      return res.json();
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONCLUIDA" }),
      });
      return res.json();
    },
    onSuccess: () => {
      toast.success("Tarefa concluída!");
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => toast.error("Erro ao concluir tarefa"),
  });

  const tasks = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-7 text-xs border border-input bg-background rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            </div>
          ))
        ) : tasks.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma tarefa encontrada.
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              {/* Complete button */}
              <button
                onClick={() => task.status !== "CONCLUIDA" && completeMutation.mutate(task.id)}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-500 transition-colors"
                disabled={task.status === "CONCLUIDA"}
              >
                {task.status === "CONCLUIDA" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {PRIORITY_ICON[task.priority]}
                  <span
                    className={`text-sm font-medium ${
                      task.status === "CONCLUIDA"
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {task.type}
                  </span>
                </div>

                {task.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {task.description}
                  </p>
                )}

                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {task.customer && (
                    <Link
                      href={`/customers/${task.customer.id}`}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <User className="w-3 h-3" />
                      {task.customer.firstName} {task.customer.lastName}
                    </Link>
                  )}
                  {task.dueAt && (
                    <div
                      className={`flex items-center gap-1 text-xs ${
                        new Date(task.dueAt) < new Date() && task.status !== "CONCLUIDA"
                          ? "text-red-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      <Calendar className="w-3 h-3" />
                      {formatDate(task.dueAt)}
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground/60">
                    {task.assignedTo.name}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
