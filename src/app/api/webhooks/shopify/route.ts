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
      if (payload.completed_at) break; // já finalizado, ignora

      const email = (payload.email as string | null)?.toLowerCase().trim() ?? null;
      const customer = email
        ? await db.customer.findFirst({ where: { email }, select: { id: true } })
        : null;

      // Normaliza line_items para camelCase antes de salvar
      const lineItems = (payload.line_items ?? []).map((i: Record<string, unknown>) => ({
        productId: i.product_id ? String(i.product_id) : null,
        variantId: i.variant_id ? String(i.variant_id) : null,
        title: i.title ?? "",
        variantTitle: i.variant_title ?? null,
        quantity: Number(i.quantity) || 1,
        price: parseFloat(String(i.price ?? "0")),
        sku: i.sku ?? null,
      }));

      const checkoutUrl = (payload.abandoned_checkout_url ?? payload.checkout_url ?? null) as string | null;
      const totalPrice = parseFloat(String(payload.total_price ?? "0"));

      await db.abandonedCart.upsert({
        where: { shopifyCheckoutId: String(payload.id) },
        create: {
          shopifyCheckoutId: String(payload.id),
          customerId: customer?.id ?? null,
          email,
          totalPrice,
          currency: (payload.currency as string) ?? "BRL",
          checkoutUrl,
          lineItems,
          abandonedAt: new Date((payload.updated_at as string) ?? new Date()),
        },
        update: {
          totalPrice,
          checkoutUrl,
          lineItems,
          customerId: customer?.id ?? null,
          abandonedAt: new Date((payload.updated_at as string) ?? new Date()),
          updatedAt: new Date(),
        },
      });

      console.log(`[webhook] Carrinho ${topic}: ${email} R$${totalPrice}`);
      break;
    }

    case "orders/create": {
      // Marca o carrinho como recuperado quando pedido é criado
      const checkoutToken = payload.checkout_token as string | null;
      const checkoutId = payload.checkout_id ? String(payload.checkout_id) : null;

      if (checkoutId) {
        await db.abandonedCart.updateMany({
          where: { shopifyCheckoutId: checkoutId, recoveredAt: null },
          data: { recoveredAt: new Date() },
        });
      } else if (checkoutToken) {
        await db.abandonedCart.updateMany({
          where: { shopifyCheckoutId: { contains: checkoutToken }, recoveredAt: null },
          data: { recoveredAt: new Date() },
        });
      }
      break;
    }
  }

  return NextResponse.json({ ok: true });
}
