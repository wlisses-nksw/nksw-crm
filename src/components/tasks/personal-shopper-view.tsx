"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, CheckCircle2, Circle, RefreshCw, Sparkles, ExternalLink, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/shared/score-badge";
import { formatCurrency, formatRelative } from "@/lib/utils";
import Link from "next/link";
import type { CustomerSegment, TaskStatus } from "@prisma/client";

interface PSTask {
  id: string;
  status: TaskStatus;
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
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data, isLoading } = useQuery<{ data: PSTask[]; total: number }>({
    queryKey: ["personal-shopper"],
    queryFn: () => fetch("/api/personal-shopper").then((r) => r.json()),
  });

  const tasks = data?.data ?? [];
  const pending = tasks.filter((t) => t.status === "PENDENTE");
  const done = tasks.filter((t) => t.status === "CONCLUIDA");
  const allDone = tasks.length > 0 && pending.length === 0;

  const contactMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONCLUIDA" }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-shopper"] });
    },
    onError: () => toast.error("Erro ao marcar contato"),
  });

  const generateBatch = useCallback(async (forceNew = false) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/personal-shopper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceNew }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`${json.generated} clientes carregados pela IA`);
        qc.invalidateQueries({ queryKey: ["personal-shopper"] });
      } else if (res.status === 409) {
        // Já tem lote hoje, força novo
        await generateBatch(true);
        return;
      } else {
        toast.error(json.error ?? "Erro ao gerar lista");
      }
    } catch {
      toast.error("Erro ao gerar lista");
    }
    setGenerating(false);
  }, [qc]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Carregando...
      </div>
    );
  }

  // Sem lote gerado ainda
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Sparkles className="w-10 h-10 text-primary/40" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          A IA vai selecionar ~100 clientes com maior propensão de compra e telefone cadastrado.
        </p>
        <Button onClick={() => generateBatch(false)} disabled={generating} className="gap-2">
          <Sparkles className="w-4 h-4" />
          {generating ? "Gerando lista..." : "Gerar lista de hoje"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com progresso */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{done.length}</span> de{" "}
            <span className="font-semibold text-foreground">{tasks.length}</span> contatados
          </span>
          {/* Barra de progresso */}
          <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${tasks.length > 0 ? (done.length / tasks.length) * 100 : 0}%` }}
            />
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => generateBatch(true)}
          disabled={generating}
          className="gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />
          {allDone ? "Carregar mais clientes" : "Novo lote"}
        </Button>
      </div>

      {/* Lista de pendentes */}
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
                onContact={() => contactMutation.mutate(task.id)}
                loading={contactMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lista de contatados */}
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

  const whatsappLink = c.phone
    ? `https://wa.me/55${c.phone.replace(/\D/g, "")}`
    : null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        done ? "opacity-50" : "hover:bg-muted/30"
      }`}
    >
      {/* Status */}
      <div className="shrink-0">
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Info cliente */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/customers/${c.id}`}
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            {c.firstName} {c.lastName}
          </Link>
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              SEGMENT_COLOR[c.segment] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {SEGMENT_LABEL[c.segment] ?? c.segment}
          </span>
          {c.rfmScore != null && (
            <span className="text-[10px] text-muted-foreground">
              RFM {c.rfmScore}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {c.phone && (
            <a
              href={whatsappLink ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
            >
              <Phone className="w-3 h-3" />
              {c.phone}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {c.totalSpent != null && (
            <span className="text-xs text-muted-foreground">
              {formatCurrency(Number(c.totalSpent))} total
            </span>
          )}
          {c.lastOrderAt && (
            <span className="text-xs text-muted-foreground">
              última compra {formatRelative(c.lastOrderAt)}
            </span>
          )}
        </div>
      </div>

      {/* Ações */}
      {!done && onContact && (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={onContact}
            disabled={loading}
            className="h-7 text-xs gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Contatado
          </Button>
        </div>
      )}
    </div>
  );
}
