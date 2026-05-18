"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  User,
  Calendar,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
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

interface ShopperUser {
  id: string;
  name: string | null;
  email: string;
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
  const { data: session } = useSession();
  const qc = useQueryClient();

  const isAdmin = session?.user?.role === "ADMIN";
  const isSupervisor = session?.user?.role === "SUPERVISOR";
  const canManage = isAdmin || isSupervisor;

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Lista de usuários para seletor (admin/supervisor)
  const { data: usersData } = useQuery<{ data: ShopperUser[] }>({
    queryKey: ["admin-users-select"],
    queryFn: () => fetch("/api/admin/users").then((r) => r.json()),
    enabled: canManage,
  });
  const userOptions = usersData?.data ?? [];

  const { data, isLoading } = useQuery<{ data: Task[]; total: number }>({
    queryKey: ["tasks", statusFilter, dateFilter, assigneeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter) params.set("dueDate", dateFilter);
      if (assigneeFilter) params.set("assignedToId", assigneeFilter);
      else if (!canManage && session?.user?.id) params.set("assignedToId", session.user.id);
      const res = await fetch(`/api/tasks?${params}`);
      return res.json();
    },
    enabled: !!session,
  });

  const tasks = data?.data ?? [];
  const pendingTasks = tasks.filter((t) => t.status !== "CONCLUIDA");
  const allPendingSelected = pendingTasks.length > 0 && pendingTasks.every((t) => selected.has(t.id));

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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingTasks.map((t) => t.id)));
    }
  };

  const completeSelected = async () => {
    if (selected.size === 0) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${json.updated} tarefas concluídas`);
        setSelected(new Set());
        qc.invalidateQueries({ queryKey: ["tasks"] });
      } else {
        toast.error(json.error ?? "Erro ao concluir");
      }
    } catch {
      toast.error("Erro ao concluir tarefas");
    }
    setCompleting(false);
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Excluir ${selected.size} tarefa(s)? Esta ação não pode ser desfeita.`)) return;
    setClearing(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${json.deleted} tarefa(s) removida(s)`);
        setSelected(new Set());
        qc.invalidateQueries({ queryKey: ["tasks"] });
      } else {
        toast.error(json.error ?? "Erro ao excluir");
      }
    } catch {
      toast.error("Erro ao excluir tarefas");
    }
    setClearing(false);
  };

  return (
    <div className="space-y-3">
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

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Seletor de usuário — Admin/Supervisor */}
          {canManage && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-7 text-xs border border-input bg-background rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Todos os usuários —</option>
              {userOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          )}

          {/* Filtro de data */}
          <div className="flex items-center gap-1.5">
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
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Barra de ações em lote */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-xs font-medium text-primary">{selected.size} selecionada(s)</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={completeSelected}
              disabled={completing}
              className="h-7 text-xs gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              {completing ? "Concluindo..." : "Concluir selecionadas"}
            </Button>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={deleteSelected}
                disabled={clearing}
                className="h-7 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearing ? "Excluindo..." : "Excluir selecionadas"}
              </Button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {/* Header com selecionar todos */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/30">
            <button
              onClick={toggleSelectAll}
              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
            >
              {allPendingSelected
                ? <CheckSquare className="w-4 h-4 text-primary" />
                : <Square className="w-4 h-4" />
              }
            </button>
            <span className="text-xs text-muted-foreground">
              {allPendingSelected ? "Desmarcar todos" : "Selecionar todos pendentes"}
            </span>
          </div>
        )}

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
          tasks.map((task) => {
            const isDone = task.status === "CONCLUIDA";
            const isChecked = selected.has(task.id);
            return (
              <div
                key={task.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                  isChecked ? "bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                {/* Checkbox de seleção */}
                <button
                  onClick={() => !isDone && toggleSelect(task.id)}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    isDone
                      ? "text-muted-foreground/30 cursor-default"
                      : isChecked
                      ? "text-primary"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                  disabled={isDone}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : isChecked ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>

                {/* Botão concluir individual */}
                {!isDone && (
                  <button
                    onClick={() => completeMutation.mutate(task.id)}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-500 transition-colors"
                  >
                    <Circle className="w-4 h-4" />
                  </button>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRIORITY_ICON[task.priority]}
                    <span
                      className={`text-sm font-medium ${
                        isDone ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {task.title}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {task.type}
                    </span>
                  </div>

                  {task.description && !task.description.startsWith("pool:") && (
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
                          new Date(task.dueAt) < new Date() && !isDone
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
            );
          })
        )}
      </div>
    </div>
  );
}
