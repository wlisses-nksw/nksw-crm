"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, CheckCircle2, Circle, RefreshCw, Sparkles, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatRelative } from "@/lib/utils";
import Link from "next/link";
import type { CustomerSegment, TaskStatus } from "@prisma/client";

interface PSTask {
  id: string;
  status: TaskStatus;
  description: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    segment: CustomerSegment;
    rfmScore: number | null;
    rfmLabel: string | null;
    totalSpent: number | null;
    lastOrderAt: string | null;
  } | null;
}

interface PSUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
}

const SEGMENT_LABEL: Record<string, string> = {
  VIP: "VIP",
  ALTO_POTENCIAL: "Alto Potencial",
  RECORRENTE: "Recorrente",
  EM_RISCO: "Em Risco",
  INATIVO: "Inativo",
  NOVO: "Novo",
  PRIMEIRA_COMPRA: "1ª Compra",
};

const SEGMENT_COLOR: Record<string, string> = {
  VIP: "bg-purple-100 text-purple-700",
  ALTO_POTENCIAL: "bg-blue-100 text-blue-700",
  RECORRENTE: "bg-green-100 text-green-700",
  EM_RISCO: "bg-orange-100 text-orange-700",
  INATIVO: "bg-gray-100 text-gray-500",
  NOVO: "bg-teal-100 text-teal-700",
  PRIMEIRA_COMPRA: "bg-pink-100 text-pink-700",
};

export function PersonalShopperView() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const isAdmin = session?.user?.role === "ADMIN";
  const isSupervisor = session?.user?.role === "SUPERVISOR";
  const isPS = session?.user?.role === "PERSONAL_SHOPPER";
  const isReadOnly = isSupervisor;
  const canClear = isAdmin || isSupervisor;

  const [selectedPsId, setSelectedPsId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [prompt, setPrompt] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Lista de PS users (só admin carrega)
  const { data: usersData } = useQuery<{ data: PSUser[] }>({
    queryKey: ["ps-users"],
    queryFn: () => fetch("/api/admin/users").then((r) => r.json()),
    enabled: isAdmin || isSupervisor,
  });
  const psUsers = (usersData?.data ?? []).filter(
    (u) => u.active && u.role === "PERSONAL_SHOPPER"
  );

  // Tasks do PS selecionado (ou do próprio usuário)
  const assignedToId = isAdmin || isSupervisor ? selectedPsId || undefined : session?.user?.id;

  const { data, isLoading } = useQuery<{ data: PSTask[]; total: number; pools: { winback: number; rfm: number } }>({
    queryKey: ["personal-shopper", assignedToId],
    queryFn: () => {
      const params = assignedToId ? `?assignedToId=${assignedToId}` : "";
      return fetch(`/api/personal-shopper${params}`).then((r) => r.json());
    },
    enabled: !!session,
  });

  const tasks = data?.data ?? [];
  const pending = tasks.filter((t) => t.status === "PENDENTE");
  const done = tasks.filter((t) => t.status === "CONCLUIDA");
  const allDone = tasks.length > 0 && pending.length === 0;
  const pools = data?.pools;

  const contactMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONCLUIDA" }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personal-shopper"] }),
    onError: () => toast.error("Erro ao marcar contato"),
  });

  const generateBatch = useCallback(async (forceNew = false) => {
    if (isPS) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/personal-shopper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forceNew,
          assignedToId: (isAdmin || isSupervisor) ? (selectedPsId || session?.user?.id) : session?.user?.id,
          date: selectedDate,
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${json.generated} clientes carregados — Win-back: ${json.pools?.winback ?? 0}, Alto RFM: ${json.pools?.rfm ?? 0}`);
        qc.invalidateQueries({ queryKey: ["personal-shopper"] });
      } else if (res.status === 409) {
        await generateBatch(true);
        return;
      } else {
        toast.error(json.error ?? "Erro ao gerar lista");
      }
    } catch {
      toast.error("Erro ao gerar lista");
    }
    setGenerating(false);
  }, [qc, isAdmin, isSupervisor, isPS, isReadOnly, selectedPsId, selectedDate, prompt, session?.user?.id]);

  const clearRecords = useCallback(async () => {
    if (!confirm("Limpar os registros de hoje? Esta ação não pode ser desfeita.")) return;
    setClearing(true);
    try {
      const params = selectedPsId ? `?assignedToId=${selectedPsId}` : "";
      const res = await fetch(`/api/personal-shopper${params}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${json.deleted} registros removidos`);
        qc.invalidateQueries({ queryKey: ["personal-shopper"] });
      } else {
        toast.error(json.error ?? "Erro ao limpar");
      }
    } catch {
      toast.error("Erro ao limpar registros");
    }
    setClearing(false);
  }, [isAdmin, selectedPsId, qc]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Painel admin/supervisor */}
      {(isAdmin || isSupervisor) && (
        <div className="bg-white border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Painel Admin</p>
          <div className="flex items-end gap-3 flex-wrap">
            {/* Seletor de PS */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Personal Shopper</label>
              <select
                value={selectedPsId}
                onChange={(e) => setSelectedPsId(e.target.value)}
                className="h-8 text-sm border border-border rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary min-w-[200px]"
              >
                <option value="">— Todos —</option>
                {psUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Data dos leads */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Data dos leads</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-8 text-sm border border-border rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Gerar leads */}
            <Button
              size="sm"
              onClick={() => generateBatch(false)}
              disabled={generating}
              className="gap-1.5 h-8"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {generating ? "Gerando..." : "Gerar leads diários"}
            </Button>

            {/* Limpar registros — no painel admin */}
            <Button
              size="sm"
              variant="outline"
              onClick={clearRecords}
              disabled={clearing}
              className="gap-1.5 h-8 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearing ? "Limpando..." : "Limpar registros"}
            </Button>
          </div>

          {/* Prompt de seleção */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Prompt de seleção IA{" "}
              <span className="text-muted-foreground/60">(opcional — descreva o perfil do dia)</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: clientes VIP que não compram há 60 dias de SP e RJ, com gasto acima de R$500..."
              rows={2}
              className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Info pools */}
          {pools && tasks.length > 0 && (
            <div className="flex gap-4 pt-1">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-orange-600">{pools.winback}</span> win-back (90–365 dias)
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-blue-600">{pools.rfm}</span> alto RFM
              </span>
            </div>
          )}
        </div>
      )}


      {/* Sem lote */}
      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Sparkles className="w-10 h-10 text-primary/40" />
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            {isAdmin
              ? "Selecione uma personal shopper e clique em \"Gerar leads diários\"."
              : "Nenhum lead gerado para hoje ainda."}
          </p>
          {!isAdmin && !isReadOnly && (
            <Button onClick={() => generateBatch(false)} disabled={generating} className="gap-2">
              <Sparkles className="w-4 h-4" />
              {generating ? "Gerando lista..." : "Gerar lista de hoje"}
            </Button>
          )}
        </div>
      )}

      {/* Lista com progresso */}
      {tasks.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{done.length}</span> de{" "}
                <span className="font-semibold text-foreground">{tasks.length}</span> contatados
              </span>
              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${tasks.length > 0 ? (done.length / tasks.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            {/* Limpar registros — apenas Admin e Supervisor */}
            {canClear && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearRecords}
                disabled={clearing}
                className="gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-3 h-3" />
                {clearing ? "Limpando..." : "Limpar registros de hoje"}
              </Button>
            )}

            {!isReadOnly && (
              <Button variant="outline" size="sm" onClick={() => generateBatch(true)} disabled={generating} className="gap-2">
                <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
                {allDone ? "Carregar mais clientes" : "Novo lote"}
              </Button>
            )}
          </div>

          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">
                Aguardando contato ({pending.length})
              </p>
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {pending.map((task) => (
                  <CustomerRow
                    key={task.id}
                    task={task}
                    onContact={isReadOnly ? undefined : () => contactMutation.mutate(task.id)}
                    loading={contactMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">
                Contatados ({done.length})
              </p>
              <div className="bg-muted/30 border border-border rounded-xl divide-y divide-border">
                {done.map((task) => (
                  <CustomerRow key={task.id} task={task} done />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CustomerRow({
  task,
  onContact,
  loading,
  done,
}: {
  task: PSTask;
  onContact?: () => void;
  loading?: boolean;
  done?: boolean;
}) {
  const c = task.customer;
  if (!c) return null;

  const isWinback = task.description?.includes("pool:winback");
  const whatsappLink = c.phone ? `https://wa.me/55${c.phone.replace(/\D/g, "")}` : null;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${done ? "opacity-50" : "hover:bg-muted/30"}`}>
      <div className="shrink-0">
        {done ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/customers/${c.id}`} className="text-sm font-medium hover:text-primary transition-colors">
            {c.firstName} {c.lastName}
          </Link>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${SEGMENT_COLOR[c.segment] ?? "bg-muted text-muted-foreground"}`}>
            {SEGMENT_LABEL[c.segment] ?? c.segment}
          </span>
          {isWinback && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
              win-back
            </span>
          )}
          {c.rfmScore != null && (
            <span className="text-[10px] text-muted-foreground">RFM {c.rfmScore}</span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {c.phone && (
            <a href={whatsappLink ?? "#"} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
              <Phone className="w-3 h-3" />
              {c.phone}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {c.totalSpent != null && (
            <span className="text-xs text-muted-foreground">{formatCurrency(Number(c.totalSpent))} total</span>
          )}
          {c.lastOrderAt && (
            <span className="text-xs text-muted-foreground">última compra {formatRelative(c.lastOrderAt)}</span>
          )}
        </div>
      </div>

      {!done && onContact && (
        <Button size="sm" variant="outline" onClick={onContact} disabled={loading} className="h-7 text-xs gap-1.5 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Contatado
        </Button>
      )}
    </div>
  );
}
