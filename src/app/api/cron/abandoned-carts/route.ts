import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchAbandonedCheckouts } from "@/lib/shopify";

export async function GET(req: NextRequest) {
  // Aceita Vercel cron (Authorization: Bearer CRON_SECRET) OU usuário logado
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const session = isCron ? true : await auth();

  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  console.log("[cron/abandoned-carts] Iniciando sync de carrinhos abandonados...");

  try {
    const checkouts = await fetchAbandonedCheckouts();

    let synced = 0;
    let errors = 0;

    for (const co of checkouts) {
      try {
        const customer = co.customer_id
          ? await db.customer.findFirst({
              where: { shopifyId: String(co.customer_id) },
            })
          : null;

        await db.abandonedCart.upsert({
          where: { shopifyCheckoutId: String(co.id) },
          create: {
            shopifyCheckoutId: String(co.id),
            customerId: customer?.id ?? null,
            email: co.email,
            totalPrice: parseFloat(co.total_price),
            currency: co.currency,
            checkoutUrl: co.checkout_url || co.abandoned_checkout_url,
            lineItems: co.line_items as object,
            abandonedAt: new Date(co.updated_at),
          },
          update: {
            totalPrice: parseFloat(co.total_price),
            checkoutUrl: co.checkout_url || co.abandoned_checkout_url,
            lineItems: co.line_items as object,
            abandonedAt: new Date(co.updated_at),
            customerId: customer?.id ?? null,
            updatedAt: new Date(),
          },
        });

        synced++;
      } catch (err) {
        console.error(`[cron/abandoned-carts] Erro no carrinho ${co.id}:`, err);
        errors++;
      }
    }

    console.log(`[cron/abandoned-carts] Concluído: ${synced} carrinhos, ${errors} erros`);
    return NextResponse.json({ ok: true, synced, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[cron/abandoned-carts] Falha:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
