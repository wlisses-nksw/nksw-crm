"use client";

import { useState, useEffect } from "react";
import { KeyRound, User, RefreshCw, Database, CheckCircle2, XCircle, Clock, Terminal, ShieldCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";

interface Props {
  session: { user: { id?: string; name?: string | null; email?: string | null; role: string } } | null;
  integration: {
    status: string;
    lastSyncAt: string | null;
    syncedCount: number;
    lastError: string | null;
  } | null;
  customerCount: number;
}

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  active: boolean;
  onVacation?: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  PERSONAL_SHOPPER: "Personal Shopper",
  VIEWER: "Viewer",
};

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-700 border-purple-200",
  SUPERVISOR: "bg-blue-100 text-blue-700 border-blue-200",
  PERSONAL_SHOPPER: "bg-green-100 text-green-700 border-green-200",
  VIEWER: "bg-gray-100 text-gray-600 border-gray-200",
};

const UI_ROLES = ["ADMIN", "SUPERVISOR", "PERSONAL_SHOPPER"];

type Tab = "conta" | "integracoes" | "admin";

export function SettingsClient({ session, integration, customerCount }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("conta");
  const [pwLoading, setPwLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [emailSync, setEmailSync] = useState("");
  const [emailSyncLoading, setEmailSyncLoading] = useState(false);
  const [emailSyncResult, setEmailSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const isAdmin = session?.user?.role === "ADMIN";

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

  async function handleEmailSync(e: React.FormEvent) {
    e.preventDefault();
    if (!emailSync.trim()) return;
    setEmailSyncLoading(true);
    setEmailSyncResult(null);
    try {
      const res = await fetch("/api/integrations/shopify/sync-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailSync.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailSyncResult({ ok: false, msg: data.error ?? "Erro no sync" });
      } else {
        setEmailSyncResult({
          ok: true,
          msg: data.customerFound
            ? `✓ Cliente encontrado — ${data.ordersSynced} de ${data.ordersTotal} pedido(s) sincronizado(s)`
            : `⚠ Cliente não encontrado no Shopify para ${data.email}`,
        });
      }
    } catch {
      setEmailSyncResult({ ok: false, msg: "Erro de conexão" });
    } finally {
      setEmailSyncLoading(false);
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

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie sua conta e integrações</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("conta")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "conta"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Conta
        </button>
        <button
          onClick={() => setActiveTab("integracoes")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "integracoes"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Integrações
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab("admin")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "admin"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Admin
          </button>
        )}
      </div>

      {/* Aba Conta */}
      {activeTab === "conta" && (
        <div className="space-y-6">
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
                <span className="font-semibold">
                  {ROLE_LABELS[session?.user?.role ?? ""] ?? session?.user?.role ?? "—"}
                </span>
              </div>
            </div>
          </div>

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
        </div>
      )}

      {/* Aba Integrações */}
      {activeTab === "integracoes" && (
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

          <div className="flex flex-col gap-4">
            {/* Sync geral */}
            <div className="flex items-center gap-3">
              <Button onClick={handleIncrementalSync} disabled={syncLoading} variant="outline" size="sm" className="gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? "animate-spin" : ""}`} />
                {syncLoading ? "Sincronizando..." : "Sync incremental (últimas 25h)"}
              </Button>
            </div>

            {/* Sync por email */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Forçar sync de cliente específico</p>
              <form onSubmit={handleEmailSync} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email do cliente..."
                  value={emailSync}
                  onChange={e => { setEmailSync(e.target.value); setEmailSyncResult(null); }}
                  className="text-sm h-8 max-w-xs"
                />
                <Button type="submit" size="sm" disabled={emailSyncLoading} variant="outline" className="gap-1.5 h-8 shrink-0">
                  <RefreshCw className={`w-3.5 h-3.5 ${emailSyncLoading ? "animate-spin" : ""}`} />
                  {emailSyncLoading ? "Buscando..." : "Sincronizar"}
                </Button>
              </form>
              {emailSyncResult && (
                <p className={`text-xs mt-2 ${emailSyncResult.ok ? "text-green-600" : "text-red-600"}`}>
                  {emailSyncResult.msg}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Busca todos os pedidos do cliente no Shopify e salva no CRM. Útil para pedidos que não entraram automaticamente.
              </p>
            </div>
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
      )}

      {/* Aba Admin */}
      {activeTab === "admin" && isAdmin && (
        <AdminTab currentUserId={session?.user?.id} />
      )}
    </div>
  );
}

function AdminTab({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "PERSONAL_SHOPPER" });
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsers(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleRoleChange(userId: string, role: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
      toast.success("Perfil atualizado");
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao atualizar");
    }
  }

  async function handleToggleVacation(userId: string, onVacation: boolean) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onVacation: !onVacation }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, onVacation: !onVacation } : u));
      toast.success(!onVacation ? "Férias ativadas" : "Férias desativadas");
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao atualizar");
    }
  }

  async function handleToggleActive(userId: string, active: boolean) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, active: !active } : u));
      toast.success(!active ? "Usuário ativado" : "Usuário desativado");
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao atualizar");
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm("Confirmar remoção do usuário?")) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("Usuário removido");
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Erro ao remover");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao criar usuário"); return; }
      toast.success("Usuário criado com sucesso");
      setUsers((prev) => [...prev, data.data]);
      setNewUser({ name: "", email: "", password: "", role: "PERSONAL_SHOPPER" });
      setShowNewUser(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Gerenciamento de usuários</h2>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowNewUser((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />
            Novo usuário
          </Button>
        </div>

        {showNewUser && (
          <form onSubmit={handleCreateUser} className="bg-muted/40 border border-border rounded-lg p-4 mb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Novo usuário</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nu-name">Nome</Label>
                <Input id="nu-name" value={newUser.name} onChange={(e) => setNewUser((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nu-email">Email</Label>
                <Input id="nu-email" type="email" value={newUser.email} onChange={(e) => setNewUser((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nu-password">Senha</Label>
                <Input id="nu-password" type="password" value={newUser.password} onChange={(e) => setNewUser((f) => ({ ...f, password: e.target.value }))} required minLength={6} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nu-role">Perfil</Label>
                <select
                  id="nu-role"
                  value={newUser.role}
                  onChange={(e) => setNewUser((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {UI_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewUser(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={creating}>{creating ? "Criando..." : "Criar usuário"}</Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum usuário encontrado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Nome</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Perfil</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Férias</th>
                  <th className="pb-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  return (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-3 font-medium">{user.name ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{user.email}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGE[user.role] ?? ROLE_BADGE.VIEWER}`}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`text-xs font-medium ${user.active ? "text-green-600" : "text-red-500"}`}>
                          {user.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        {user.role === "PERSONAL_SHOPPER" ? (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                            !user.active
                              ? "bg-gray-100 text-gray-500"
                              : user.onVacation
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-green-100 text-green-700"
                          }`}>
                            {!user.active ? "Inativo" : user.onVacation ? "Férias" : "Ativo"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          {!isSelf && (
                            <>
                              <select
                                value={user.role}
                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                className="rounded border border-input bg-background px-2 py-1 text-xs"
                              >
                                {UI_ROLES.map((r) => (
                                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                              </select>
                              {user.role === "PERSONAL_SHOPPER" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`h-7 text-xs px-2 ${user.onVacation ? "border-yellow-300 text-yellow-700 hover:bg-yellow-50" : ""}`}
                                  onClick={() => handleToggleVacation(user.id, user.onVacation ?? false)}
                                >
                                  {user.onVacation ? "Voltar de férias" : "Férias"}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => handleToggleActive(user.id, user.active)}
                              >
                                {user.active ? "Desativar" : "Ativar"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => handleDelete(user.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          {isSelf && <span className="text-xs text-muted-foreground">(você)</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
