"use client";

import { useEffect, useState } from "react";
import { Mail, RefreshCw, TrendingUp, MousePointerClick, Send, AlertCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";

interface Campaign {
  id: string;
  campaignID: string;
  name: string;
  subject: string | null;
  status: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  startDate: string | null;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  syncedAt: string;
}

export default function EmailCampanhasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    fetch("/api/omnisend/campaigns")
      .then(r => r.json())
      .then(({ data }) => { setCampaigns(data ?? []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/cron/omnisend-sync");
      const json = await res.json();
      if (res.ok) { toast.success(`${json.synced} campanhas sincronizadas`); load(); }
      else toast.error(json.error ?? "Erro ao sincronizar");
    } catch { toast.error("Erro ao sincronizar"); }
    setSyncing(false);
  };

  const sent = campaigns.filter(c => c.status === "sent");
  const avgOpenRate  = sent.length ? Math.round(sent.reduce((s, c) => s + c.openRate,  0) / sent.length) : 0;
  const avgClickRate = sent.length ? Math.round(sent.reduce((s, c) => s + c.clickRate, 0) / sent.length) : 0;

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Email Campanhas" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Email Campanhas" />
      <div className="flex-1 p-6 space-y-6">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Stats agregados via Omnisend API · Por-contato disponível no plano Pro
          </p>
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing} className="gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Atualizar"}
          </Button>
        </div>

        {/* KPIs */}
        {sent.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <KpiCard icon={Send} label="Campanhas enviadas" value={String(sent.length)} />
            <KpiCard icon={TrendingUp} label="Taxa abertura média" value={`${avgOpenRate}%`} color="text-green-600" />
            <KpiCard icon={MousePointerClick} label="Taxa clique média" value={`${avgClickRate}%`} color="text-blue-600" />
          </div>
        )}

        {/* Lista campanhas */}
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Mail className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Nenhuma campanha encontrada.</p>
            <p className="text-xs mt-1">Clique em Atualizar para buscar do Omnisend.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => (
              <CampaignRow key={c.id} campaign={c} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color = "text-foreground" }: {
  icon: React.ElementType; label: string; value: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function CampaignRow({ campaign: c }: { campaign: Campaign }) {
  const isSent = c.status === "sent";

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-medium text-sm truncate">{c.name}</span>
            <StatusBadge status={c.status} />
          </div>
          {c.subject && <p className="text-xs text-muted-foreground truncate">{c.subject}</p>}
          {c.startDate && (
            <p className="text-xs text-muted-foreground mt-0.5">{formatRelative(c.startDate)}</p>
          )}
        </div>

        {isSent && c.sent > 0 && (
          <div className="flex gap-6 shrink-0 text-right">
            <Stat label="Enviados" value={c.sent.toLocaleString("pt-BR")} />
            <Stat label="Abertos" value={`${c.openRate}%`} color="text-green-600" sub={c.opened.toLocaleString("pt-BR")} />
            <Stat label="Cliques" value={`${c.clickRate}%`} color="text-blue-600" sub={c.clicked.toLocaleString("pt-BR")} />
            {c.bounced > 0 && <Stat label="Bounce" value={`${c.bounceRate}%`} color="text-red-500" sub={c.bounced.toLocaleString("pt-BR")} />}
          </div>
        )}

        {isSent && c.sent === 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5" />
            Sem dados
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = "text-foreground", sub }: {
  label: string; value: string; color?: string; sub?: string;
}) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent:      { label: "Enviada",    cls: "bg-green-100 text-green-700" },
    scheduled: { label: "Agendada",   cls: "bg-blue-100 text-blue-700" },
    draft:     { label: "Rascunho",   cls: "bg-muted text-muted-foreground" },
    paused:    { label: "Pausada",    cls: "bg-yellow-100 text-yellow-700" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
