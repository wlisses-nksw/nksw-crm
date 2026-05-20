"use client";

import { useEffect, useState, useCallback } from "react";
import { ShoppingCart, ExternalLink, User, UserX, Phone, Mail, CheckCircle2, Send, RefreshCw } from "lucide-react";
import { formatCurrency, formatRelative, formatPhone } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import type { CustomerSegment } from "@prisma/client";

interface LineItem {
  title: string;
  variantTitle?: string | null;
  quantity: number;
  price: number;
}

interface Cart {
  id: string;
  email: string | null;
  totalPrice: string | number;
  checkoutUrl: string | null;
  abandonedAt: string;
  contactedAt: string | null;
  lineItems: LineItem[];
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    segment: string;
  } | null;
}

type Tab = "pending" | "contacted";

export default function CarrinhosPage() {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<Tab>("pending");

  const load = useCallback(() => {
    fetch("/api/abandoned-carts")
      .then(r => r.json())
      .then(({ data }) => {
        // Garante ordem: mais novo primeiro
        const sorted = (data ?? []).sort(
          (a: Cart, b: Cart) => new Date(b.abandonedAt).getTime() - new Date(a.abandonedAt).getTime()
        );
        setCarts(sorted);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const syncCarts = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/cron/abandoned-carts");
      const json = await res.json();
      if (res.ok) {
        toast.success(`Atualizado! ${json.synced} carrinhos sincronizados.`);
        load();
      } else {
        toast.error(json.error ?? "Erro ao sincronizar");
      }
    } catch {
      toast.error("Erro ao sincronizar carrinhos");
    }
    setSyncing(false);
  };

  const markContacted = async (cartId: string, contacted: boolean) => {
    await fetch("/api/abandoned-carts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cartId, action: contacted ? "contacted" : "uncontacted" }),
    });
    toast.success(contacted ? "Marcado como contatado" : "Movido para não contatados");
    load();
  };

  const pending   = carts.filter(c => !c.contactedAt);
  const contacted = carts.filter(c => !!c.contactedAt);
  const displayed = tab === "pending" ? pending : contacted;

  const withCustomer    = displayed.filter(c => c.customer);
  const withoutCustomer = displayed.filter(c => !c.customer);

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Carrinhos Abandonados" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Carrinhos Abandonados" />
      <div className="flex-1 p-6 space-y-6">

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          {/* Abas */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
            <TabBtn active={tab === "pending"} onClick={() => setTab("pending")} count={pending.length}>
              Não Contatados
            </TabBtn>
            <TabBtn active={tab === "contacted"} onClick={() => setTab("contacted")} count={contacted.length}>
              Contatados
            </TabBtn>
          </div>

          {/* Botão sync */}
          <Button variant="outline" size="sm" onClick={syncCarts} disabled={syncing} className="gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Atualizar"}
          </Button>
        </div>

        {displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">
              {tab === "pending" ? "Nenhum carrinho aguardando contato." : "Nenhum carrinho contatado ainda."}
            </p>
          </div>
        )}

        {/* Clientes cadastrados */}
        {withCustomer.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <User className="w-3.5 h-3.5" />
              Clientes cadastrados ({withCustomer.length})
            </h2>
            <div className="space-y-3">
              {withCustomer.map(cart => (
                <CartCard key={cart.id} cart={cart} tab={tab} onMark={markContacted} />
              ))}
            </div>
          </section>
        )}

        {/* Sem cadastro */}
        {withoutCustomer.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <UserX className="w-3.5 h-3.5" />
              Sem cadastro no CRM ({withoutCustomer.length})
            </h2>
            <div className="space-y-3">
              {withoutCustomer.map(cart => (
                <CartCard key={cart.id} cart={cart} tab={tab} onMark={markContacted} />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

function TabBtn({ active, onClick, count, children }: {
  active: boolean; onClick: () => void; count: number; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 py-1.5 px-4 rounded-md text-xs font-medium transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
        active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
      }`}>
        {count}
      </span>
    </button>
  );
}

function CartCard({ cart, tab, onMark }: {
  cart: Cart; tab: Tab; onMark: (id: string, contacted: boolean) => void;
}) {
  const items = cart.lineItems as LineItem[];
  const total = Number(cart.totalPrice);
  const [sendingWpp, setSendingWpp] = useState(false);

  const sendWhatsapp = async () => {
    if (!cart.customer) return;
    setSendingWpp(true);
    try {
      const res = await fetch(`/api/customers/${cart.customer.id}/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignSlug: "carrinho-abandonado" }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success("WhatsApp enviado — carrinho marcado como contatado!");
        onMark(cart.id, true); // marca como contatado automaticamente
      } else {
        toast.error(json.error ?? "Erro ao enviar WhatsApp");
      }
    } catch { toast.error("Erro ao enviar WhatsApp"); }
    setSendingWpp(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex gap-4">
      <div className="flex-1 min-w-0">
        {/* Nome + badge + horário */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {cart.customer ? (
              <Link href={`/customers/${cart.customer.id}`} className="font-semibold text-sm hover:text-primary transition-colors">
                {cart.customer.firstName} {cart.customer.lastName}
              </Link>
            ) : (
              <span className="font-semibold text-sm text-muted-foreground">{cart.email ?? "E-mail não informado"}</span>
            )}
            {cart.customer && <ScoreBadge segment={cart.customer.segment as CustomerSegment} />}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{formatRelative(cart.abandonedAt)}</span>
        </div>

        {/* Itens */}
        <ul className="space-y-0.5 mb-3">
          {items.slice(0, 3).map((item, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              {item.quantity}x {item.title}{item.variantTitle ? ` — ${item.variantTitle}` : ""}
              <span className="ml-1 text-foreground/60">{formatCurrency(item.price)}</span>
            </li>
          ))}
          {items.length > 3 && <li className="text-xs text-muted-foreground/50">+{items.length - 3} itens</li>}
        </ul>

        {/* Contatos */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(cart.customer?.email ?? cart.email) && (
            <a href={`mailto:${cart.customer?.email ?? cart.email}`} className="flex items-center gap-1 hover:text-foreground">
              <Mail className="w-3 h-3" />
              {cart.customer?.email ?? cart.email}
            </a>
          )}
          {cart.customer?.phone && (
            <a
              href={`https://wa.me/${(() => { const d = cart.customer!.phone!.replace(/\D/g, ""); return (d.length <= 11 ? "55" : "") + d; })()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="w-3 h-3" />
              {formatPhone(cart.customer.phone)}
            </a>
          )}
        </div>
      </div>

      {/* Valor + ações */}
      <div className="flex flex-col items-end justify-between shrink-0 gap-2">
        <span className="text-base font-bold text-orange-600">{formatCurrency(total)}</span>
        <div className="flex flex-col items-end gap-1.5">
          {cart.checkoutUrl && (
            <a href={cart.checkoutUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="w-3 h-3" />
              Enviar link
            </a>
          )}
          {tab === "pending" ? (
            <div className="flex flex-col items-end gap-1.5">
              {cart.customer?.phone && (
                <button
                  onClick={sendWhatsapp}
                  disabled={sendingWpp}
                  className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  {sendingWpp ? "Enviando..." : "Enviar WhatsApp"}
                </button>
              )}
              {/* Botão manual para quando não há telefone cadastrado */}
              {!cart.customer?.phone && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMark(cart.id, true)}>
                  <CheckCircle2 className="w-3 h-3 mr-1 text-green-600" />
                  Contatado
                </Button>
              )}
            </div>
          ) : (
            <button onClick={() => onMark(cart.id, false)} className="text-xs text-muted-foreground hover:text-foreground underline">
              Desfazer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
