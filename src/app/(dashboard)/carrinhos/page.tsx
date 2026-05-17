"use client";

import { useEffect, useState } from "react";
import { ShoppingCart, ExternalLink, User, UserX, Phone, Mail } from "lucide-react";
import { formatCurrency, formatRelative, formatPhone } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import { Header } from "@/components/layout/header";
import Link from "next/link";

interface LineItem {
  title: string;
  variantTitle?: string;
  quantity: number;
  price: number;
}

interface Cart {
  id: string;
  shopifyCheckoutId: string;
  email: string | null;
  totalPrice: string | number;
  currency: string;
  checkoutUrl: string | null;
  abandonedAt: string;
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

export default function CarrinhosPage() {
  const [carts, setCarts] = useState<Cart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/abandoned-carts")
      .then(r => r.json())
      .then(({ data }) => { setCarts(data ?? []); setLoading(false); });
  }, []);

  const comCliente = carts.filter(c => c.customer);
  const semCadastro = carts.filter(c => !c.customer);

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="Carrinhos Abandonados" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Carrinhos Abandonados" />
      <div className="flex-1 p-6 space-y-8">

        {carts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Nenhum carrinho abandonado no momento.</p>
            <p className="text-xs mt-1 opacity-60">Os carrinhos aparecem aqui em tempo real via webhook do Shopify.</p>
          </div>
        )}

        {/* Com cliente cadastrado */}
        {comCliente.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <User className="w-3.5 h-3.5" />
              Clientes cadastrados ({comCliente.length})
            </h2>
            <div className="space-y-3">
              {comCliente.map(cart => (
                <CartCard key={cart.id} cart={cart} />
              ))}
            </div>
          </section>
        )}

        {/* Sem cadastro */}
        {semCadastro.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <UserX className="w-3.5 h-3.5" />
              Sem cadastro no CRM ({semCadastro.length})
            </h2>
            <div className="space-y-3">
              {semCadastro.map(cart => (
                <CartCard key={cart.id} cart={cart} />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

function CartCard({ cart }: { cart: Cart }) {
  const items = cart.lineItems as LineItem[];
  const total = Number(cart.totalPrice);

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex gap-4">
      {/* Itens do carrinho */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {cart.customer ? (
              <Link
                href={`/customers/${cart.customer.id}`}
                className="font-semibold text-sm hover:text-primary transition-colors"
              >
                {cart.customer.firstName} {cart.customer.lastName}
              </Link>
            ) : (
              <span className="font-semibold text-sm text-muted-foreground">{cart.email ?? "E-mail não informado"}</span>
            )}
            {cart.customer && <ScoreBadge segment={cart.customer.segment as import("@prisma/client").CustomerSegment} />}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{formatRelative(cart.abandonedAt)}</span>
        </div>

        <ul className="space-y-0.5 mb-3">
          {items.slice(0, 3).map((item, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              {item.quantity}x {item.title}{item.variantTitle ? ` — ${item.variantTitle}` : ""}
              <span className="ml-1 text-foreground/60">{formatCurrency(item.price)}</span>
            </li>
          ))}
          {items.length > 3 && (
            <li className="text-xs text-muted-foreground/50">+{items.length - 3} itens</li>
          )}
        </ul>

        {/* Contatos */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(cart.customer?.email ?? cart.email) && (
            <a
              href={`mailto:${cart.customer?.email ?? cart.email}`}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Mail className="w-3 h-3" />
              {cart.customer?.email ?? cart.email}
            </a>
          )}
          {cart.customer?.phone && (
            <a
              href={`https://wa.me/${cart.customer.phone.replace(/\D/g, "")}`}
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

      {/* Valor + ação */}
      <div className="flex flex-col items-end justify-between shrink-0">
        <span className="text-base font-bold text-orange-600">{formatCurrency(total)}</span>
        {cart.checkoutUrl && (
          <a
            href={cart.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
          >
            <ExternalLink className="w-3 h-3" />
            Enviar link
          </a>
        )}
      </div>
    </div>
  );
}
