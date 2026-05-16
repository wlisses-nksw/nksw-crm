import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify";
import { processOrderWebhook } from "@/services/sync.service";
import { db } from "@/lib/db";
import type { ShopifyOrder, ShopifyCustomer } from "@/types";

export async function POST(req: NextRequest) {
  const topic = req.headers.get("X-Shopify-Topic") ?? "";
  const hmac = req.headers.get("X-Shopify-Hmac-Sha256") ?? "";

  const rawBody = await req.text();

  const isValid = await verifyShopifyWebhook(rawBody, hmac);
  if (!isValid) {
    return NextResponse.json({ error: "Webhook inválido" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  switch (topic) {
    case "orders/paid":
    case "orders/updated":
      await processOrderWebhook(payload as ShopifyOrder);
      break;

    case "customers/update":
    case "customers/create": {
      const c = payload as ShopifyCustomer;
      await db.customer.upsert({
        where: { shopifyId: String(c.id) },
        create: {
          shopifyId: String(c.id),
          email: c.email.toLowerCase(),
          firstName: c.first_name || "",
          lastName: c.last_name || "",
          phone: c.phone,
          totalSpent: parseFloat(c.total_spent),
          ordersCount: c.orders_count,
          shopifyTags: c.tags ? c.tags.split(",").map((t) => t.trim()) : [],
          acceptsMarketing: c.accepts_marketing,
        },
        update: {
          email: c.email.toLowerCase(),
          firstName: c.first_name || "",
          lastName: c.last_name || "",
          phone: c.phone,
          totalSpent: parseFloat(c.total_spent),
          ordersCount: c.orders_count,
          shopifyTags: c.tags ? c.tags.split(",").map((t) => t.trim()) : [],
          acceptsMarketing: c.accepts_marketing,
          updatedAt: new Date(),
        },
      });
      break;
    }

    case "checkouts/create":
    case "checkouts/update": {
      // Carrinho abandonado
      const email = payload.email as string | null;
      const customer = email
        ? await db.customer.findFirst({ where: { email: email.toLowerCase() } })
        : null;

      await db.abandonedCart.upsert({
        where: { shopifyCheckoutId: String(payload.id) },
        create: {
          shopifyCheckoutId: String(payload.id),
          customerId: customer?.id ?? null,
          email,
          totalPrice: parseFloat(payload.total_price ?? "0"),
          currency: payload.currency ?? "BRL",
          checkoutUrl: payload.abandoned_checkout_url ?? payload.checkout_url,
          lineItems: payload.line_items ?? [],
          abandonedAt: new Date(payload.updated_at ?? new Date()),
        },
        update: {
          totalPrice: parseFloat(payload.total_price ?? "0"),
          lineItems: payload.line_items ?? [],
          abandonedAt: new Date(payload.updated_at ?? new Date()),
          updatedAt: new Date(),
        },
      });
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
