"use client";

import { useState } from "react";
import { KeyRound, User, RefreshCw, Database, CheckCircle2, XCircle, Clock, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";

interface Props {
  session: { user: { name?: string | null; email?: string | null; role: string } } | null;
  integration: {
    status: string;
    lastSyncAt: string | null;
    syncedCount: number;
    lastError: string | null;
  } | null;
  customerCount: number;
}

export function SettingsClient({ session, integration, customerCount }: Props) {
  const [pwLoading, setPwLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) { toast.error("Senhas não coincidem"); return; }
    if (form.newPassword.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    setPwLoading(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao alterar senha"); return; }
      toast.success("Senha alterada com sucesso");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } finally {
      setPwLoading(false);
    }
  }

  async function handleIncrementalSync() {
    setSyncLoading(true);
    try {
      const res = await fetch("/api/integrations/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incremental: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message ?? "Erro no sync");
      } else {
        toast.success(`Sync concluído: ${data.synced} registros em ${data.duration?.toFixed(1)}s`);
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSyncLoading(false);
    }
  }

  const statusColor = {
    SUCCESS: "text-green-600",
    ERROR: "text-red-600",
    RUNNING: "text-yellow-600",
    IDLE: "text-muted-foreground",
  }[integration?.status ?? "IDLE"] ?? "text-muted-foreground";

  const StatusIcon = {
    SUCCESS: CheckCircle2,
    ERROR: XCircle,
    RUNNING: RefreshCw,
    IDLE: Clock,
  }[integration?.status ?? "IDLE"] ?? Clock;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie sua conta e integrações</p>
      </div>

      {/* Conta */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Informações da conta</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1 border-b border-border/50">
            <span className="text-muted-foreground">Nome</span>
            <span className="font-semibold">{session?.user?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/50">
            <span className="text-muted-foreground">Email</span>
            <span className="font-semibold">{session?.user?.email ?? "—"}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Perfil</span>
            <span className="font-semibold capitalize">
              {session?.user?.role?.toLowerCase().replace("_", " ") ?? "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Alterar senha */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Alterar senha</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input id="currentPassword" type="password" value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input id="newPassword" type="password" value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <Input id="confirmPassword" type="password" value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))} required />
          </div>
          <Button type="submit" disabled={pwLoading}>
            {pwLoading ? "Salvando..." : "Alterar senha"}
          </Button>
        </form>
      </div>

      {/* Shopify Sync */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Integração Shopify</h2>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="font-serif text-2xl font-bold text-foreground">{customerCount.toLocaleString("pt-BR")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Clientes no banco</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className={`flex items-center justify-center gap-1 mb-1 ${statusColor}`}>
              <StatusIcon className="w-4 h-4" />
              <span className="text-xs font-bold capitalize">{integration?.status?.toLowerCase() ?? "—"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Status sync</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="font-semibold text-sm text-foreground">
              {integration?.lastSyncAt ? formatRelative(new Date(integration.lastSyncAt)) : "Nunca"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Último sync</p>
          </div>
        </div>

        {integration?.lastError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
            {integration.lastError}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleIncrementalSync} disabled={syncLoading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? "animate-spin" : ""}`} />
            {syncLoading ? "Sincronizando..." : "Sync incremental (últimas 25h)"}
          </Button>
        </div>

        {customerCount === 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Terminal className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 mb-1">Banco ainda vazio — faça a importação histórica</p>
                <p className="text-xs text-amber-700 mb-2">
                  Rode o comando abaixo <strong>uma única vez</strong> no terminal para importar todo o histórico do Shopify:
                </p>
                <code className="block bg-amber-100 border border-amber-300 rounded px-3 py-2 text-xs font-mono text-amber-900">
                  npm run db:import
                </code>
                <p className="text-xs text-amber-600 mt-2">
                  Pode levar alguns minutos. Após isso, o sync diário automático mantém tudo atualizado.
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-3">
          O sync automático roda todo dia às 03:00 (horário de Brasília) via cron do Vercel.
        </p>
      </div>
    </div>
  );
}
