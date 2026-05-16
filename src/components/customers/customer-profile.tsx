"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShoppingBag,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Tag,
  MessageSquare,
  ClipboardList,
  Sparkles,
  ExternalLink,
  Plus,
  RotateCcw,
} from "lucide-react";
import { ScoreBadge } from "@/components/shared/score-badge";
import { formatCurrency, formatDate, formatRelative, formatPhone, getInitials } from "@/lib/utils";
import type { CustomerWithRelations } from "@/types";
import { Button } from "@/components/ui/button";

interface Props {
  customer: CustomerWithRelations;
}

export function CustomerProfile({ customer: initial }: Props) {
  const [customer, setCustomer] = useState(initial);
  const [activeTab, setActiveTab] = useState<"timeline" | "orders" | "ai" | "tasks">("timeline");
  const [note, setNote] = useState("");

  const queryClient = useQueryClient();

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_note", content }),
      });
      return res.json();
    },
    onSuccess: () => {
      toast.success("Nota adicionada");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
    },
    onError: () => toast.error("Erro ao adicionar nota"),
  });

  const refreshInsightsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_insights" }),
      });
      return res.json();
    },
    onSuccess: () => toast.success("Insights atualizados"),
    onError: () => toast.error("Erro ao atualizar insights"),
  });

  const TABS = [
    { id: "timeline", label: "Timeline" },
    { id: "orders", label: `Pedidos (${customer._count?.orders ?? 0})` },
    { id: "tasks", label: `Tarefas (${customer._count?.tasks ?? 0})` },
    { id: "ai", label: "IA & RFM" },
  ] as const;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Coluna esquerda — perfil */}
      <div className="space-y-4">
        {/* Card principal */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-lg font-bold text-primary">
              {getInitials(`${customer.firstName} ${customer.lastName}`)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base">
                {customer.firstName} {customer.lastName}
              </h2>
              <ScoreBadge segment={customer.segment} className="mt-1" />
              {customer.rfmLabel && (
                <p className="text-xs text-muted-foreground mt-1">{customer.rfmLabel}</p>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <InfoRow icon={Mail} label={customer.email} />
            {customer.phone && <InfoRow icon={Phone} label={formatPhone(customer.phone)} />}
            {customer.city && (
              <InfoRow
                icon={MapPin}
                label={`${customer.city}${customer.state ? `, ${customer.state}` : ""}`}
              />
            )}
            <InfoRow icon={Calendar} label={`Cliente desde ${formatDate(customer.createdAt)}`} />
            {customer.shopifyId && (
              <a
                href={`https://lofty-fy.myshopify.com/admin/customers/${customer.shopifyId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver no Shopify
              </a>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-xs font-medium text-muted-foreground mb-3">Estatísticas</h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total Gasto" value={formatCurrency(customer.totalSpent)} />
            <Stat label="Pedidos" value={String(customer.ordersCount ?? 0)} />
            <Stat label="Ticket Médio" value={formatCurrency(customer.averageOrderValue)} />
            <Stat
              label="Última Compra"
              value={customer.lastOrderAt ? formatRelative(customer.lastOrderAt) : "—"}
            />
          </div>
        </div>

        {/* RFM Score */}
        {customer.rfmScore && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">Score RFM</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <RFMBar label="Recência" value={customer.rfmRecency ?? 0} max={5} />
              <RFMBar label="Frequência" value={customer.rfmFrequency ?? 0} max={5} />
              <RFMBar label="Monetário" value={customer.rfmMonetary ?? 0} max={5} />
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3">
              Score total: <span className="font-bold text-foreground">{customer.rfmScore}</span>
            </p>
          </div>
        )}

        {/* Tags */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            Tags Shopify
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {customer.shopifyTags.length > 0 ? (
              customer.shopifyTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma tag</p>
            )}
          </div>
        </div>

        {/* Personal Shopper */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-xs font-medium text-muted-foreground mb-3">Personal Shopper</h3>
          {customer.assignedShopper ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary text-xs font-semibold">
                  {customer.assignedShopper.name?.charAt(0) ?? "?"}
                </span>
              </div>
              <p className="text-sm font-medium">{customer.assignedShopper.name}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Não atribuído</p>
          )}
        </div>
      </div>

      {/* Coluna direita — tabs */}
      <div className="xl:col-span-2 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Timeline */}
        {activeTab === "timeline" && (
          <div className="space-y-4">
            {/* Adicionar nota */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Adicionar nota interna
              </h3>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Digite uma observação sobre este cliente..."
                rows={3}
                className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  onClick={() => note.trim() && addNoteMutation.mutate(note.trim())}
                  disabled={!note.trim() || addNoteMutation.isPending}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>

            {/* Notas existentes */}
            {customer.notes && customer.notes.length > 0 && (
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {customer.notes.map((n) => (
                  <div key={n.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">{(n as unknown as { user?: { name?: string } }).user?.name ?? "Usuário"}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Pedidos */}
        {activeTab === "orders" && (
          <div className="space-y-3">
            {customer.orders && customer.orders.length > 0 ? (
              customer.orders.map((order) => (
                <div key={order.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Pedido #{order.orderNumber}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          order.financialStatus === "PAID"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {order.financialStatus}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(order.totalPrice)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                  </div>
                  {order.lineItems && order.lineItems.length > 0 && (
                    <ul className="space-y-1">
                      {order.lineItems.map((item) => (
                        <li key={item.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {item.quantity}x {item.title}
                            {item.variantTitle && ` — ${item.variantTitle}`}
                          </span>
                          <span>{formatCurrency(item.price)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum pedido registrado.
              </p>
            )}
          </div>
        )}

        {/* Tab: Tarefas */}
        {activeTab === "tasks" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Tarefas</h3>
              <Button size="sm" variant="outline">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nova
              </Button>
            </div>
            {customer.tasks && customer.tasks.length > 0 ? (
              <ul className="space-y-2">
                {customer.tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
                  >
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        task.priority === "URGENTE"
                          ? "bg-red-500"
                          : task.priority === "ALTA"
                          ? "bg-orange-500"
                          : task.priority === "MEDIA"
                          ? "bg-yellow-500"
                          : "bg-gray-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.dueAt && (
                        <p className="text-xs text-muted-foreground">{formatDate(task.dueAt)}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        task.status === "CONCLUIDA"
                          ? "bg-green-100 text-green-800"
                          : task.status === "EM_ANDAMENTO"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {task.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">Sem tarefas.</p>
            )}
          </div>
        )}

        {/* Tab: IA & RFM */}
        {activeTab === "ai" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Insights de IA
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refreshInsightsMutation.mutate()}
                disabled={refreshInsightsMutation.isPending}
              >
                <RotateCcw
                  className={`w-3.5 h-3.5 mr-1 ${refreshInsightsMutation.isPending ? "animate-spin" : ""}`}
                />
                Atualizar
              </Button>
            </div>

            {customer.aiRecommendations && customer.aiRecommendations.length > 0 ? (
              <div className="space-y-3">
                {customer.aiRecommendations.map((rec) => (
                  <div key={rec.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          (rec.metadata as { type?: string })?.type === "risk"
                            ? "bg-red-500"
                            : (rec.metadata as { type?: string })?.type === "opportunity"
                            ? "bg-green-500"
                            : "bg-blue-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium">{rec.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
                        {rec.score && (
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            Confiança: {Math.round(rec.score * 100)}%
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Clique em &quot;Atualizar&quot; para gerar insights de IA para este cliente.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function RFMBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-sm ${i < value ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
      <span className="text-xs font-bold">{value}/{max}</span>
    </div>
  );
}
