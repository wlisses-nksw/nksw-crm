import { db } from "@/lib/db";
import {
  fetchAllCustomers,
  fetchAllOrders,
  fetchAbandonedCheckouts,
  normalizeShopifyCustomer,
  normalizeShopifyOrder,
} from "@/lib/shopify";
import { recalculateAllRFM } from "@/services/rfm.service";
import type { SyncResult, ShopifyOrder } from "@/types";
import { IntegrationType, SyncStatus } from "@prisma/client";
import { differenceInHours } from "date-fns";

// ============================================================
// Sync completo Shopify → CRM
// ============================================================

export async function syncShopify(options?: {
  incrementalHours?: number;
  onProgress?: (msg: string) => void;
}): Promise<SyncResult> {
  const start = Date.now();
  let synced = 0;
  let errors = 0;

  const log = options?.onProgress ?? ((m: string) => console.log("[sync]", m));

  await setIntegrationStatus(IntegrationType.SHOPIFY, SyncStatus.RUNNING);

  try {
    // Clientes
    log("Buscando clientes do Shopify...");
    const updatedSince = options?.incrementalHours
      ? new Date(Date.now() - options.incrementalHours * 3600 * 1000).toISOString()
      : undefined;

    const shopifyCustomers = await fetchAllCustomers(updatedSince);
    log(`${shopifyCustomers.length} clientes encontrados`);

    for (const sc of shopifyCustomers) {
      try {
        const normalized = normalizeShopifyCustomer(sc);

        await db.customer.upsert({
          where: { shopifyId: normalized.shopifyId },
          create: {
            ...normalized,
            firstOrderAt: normalized.lastOrderAt,
          },
          update: {
            ...normalized,
            updatedAt: new Date(),
          },
        });

        synced++;
      } catch (err) {
        console.error(`[sync] Erro no cliente ${sc.email}:`, err);
        errors++;
      }
    }

    // Pedidos
    log("Buscando pedidos do Shopify...");
    const shopifyOrders = await fetchAllOrders({
      updatedSinceMin: updatedSince,
      financialStatus: "paid",
    });
    log(`${shopifyOrders.length} pedidos encontrados`);

    await syncOrders(shopifyOrders, log);

    // Carrinhos abandonados
    log("Buscando carrinhos abandonados...");
    const checkouts = await fetchAbandonedCheckouts();
    await syncAbandonedCarts(checkouts);
    log(`${checkouts.length} carrinhos sincronizados`);

    // Recalcular RFM após sync
    log("Recalculando scores RFM...");
    await recalculateAllRFM();
    log("RFM recalculado");

    await setIntegrationStatus(IntegrationType.SHOPIFY, SyncStatus.SUCCESS, synced);

    const duration = (Date.now() - start) / 1000;
    return {
      success: true,
      synced,
      errors,
      message: `Sync concluído: ${synced} registros, ${errors} erros`,
      duration,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    await setIntegrationStatus(IntegrationType.SHOPIFY, SyncStatus.ERROR, 0, message);

    return {
      success: false,
      synced,
      errors: errors + 1,
      message: `Sync falhou: ${message}`,
      duration: (Date.now() - start) / 1000,
    };
  }
}

// ============================================================
// Sync de pedidos
// ============================================================

async function syncOrders(
  orders: ShopifyOrder[],
  log: (m: string) => void
): Promise<void> {
  for (const so of orders) {
    try {
      if (!so.customer?.id) continue;

      const customer = await db.customer.findFirst({
        where: { shopifyId: String(so.customer.id) },
      });
      if (!customer) continue;

      const normalized = normalizeShopifyOrder(so, customer.id);

      const order = await db.order.upsert({
        where: { shopifyId: normalized.shopifyId },
        create: normalized,
        update: { ...normalized, updatedAt: new Date() },
      });

      // Line items
      await db.lineItem.deleteMany({ where: { orderId: order.id } });

      for (const item of so.line_items) {
        await db.lineItem.create({
          data: {
            orderId: order.id,
            shopifyItemId: String(item.id),
            productId: item.product_id ? String(item.product_id) : null,
            variantId: item.variant_id ? String(item.variant_id) : null,
            title: item.title,
            variantTitle: item.variant_title,
            sku: item.sku,
            quantity: item.quantity,
            price: parseFloat(item.price),
            totalDiscount: parseFloat(item.total_discount),
          },
        });
      }

      // Atualizar stats do cliente
      await updateCustomerStats(customer.id);
    } catch (err) {
      console.error(`[sync] Erro no pedido ${so.id}:`, err);
    }
  }
}

// ============================================================
// Sync de carrinhos abandonados
// ============================================================

async function syncAbandonedCarts(checkouts: Awaited<ReturnType<typeof fetchAbandonedCheckouts>>) {
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
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[sync] Erro no carrinho ${co.id}:`, err);
    }
  }
}

// ============================================================
// Atualizar stats do cliente após novos pedidos
// ============================================================

async function updateCustomerStats(customerId: string) {
  const orders = await db.order.findMany({
    where: { customerId, financialStatus: "PAID" },
    select: { totalPrice: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (orders.length === 0) return;

  const totalSpent = orders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
  const averageOrderValue = totalSpent / orders.length;
  const lastOrderAt = orders[0].createdAt;
  const firstOrderAt = orders[orders.length - 1].createdAt;

  await db.customer.update({
    where: { id: customerId },
    data: {
      ordersCount: orders.length,
      totalSpent,
      averageOrderValue,
      lastOrderAt,
      firstOrderAt,
    },
  });
}

// ============================================================
// Helpers
// ============================================================

async function setIntegrationStatus(
  type: IntegrationType,
  status: SyncStatus,
  syncedCount?: number,
  lastError?: string
) {
  await db.integration.upsert({
    where: { type },
    create: { type, status, syncedCount: syncedCount ?? 0, lastError },
    update: {
      status,
      lastSyncAt: status === SyncStatus.SUCCESS ? new Date() : undefined,
      syncedCount: syncedCount ?? 0,
      lastError: lastError ?? null,
    },
  });
}

// ============================================================
// Processar webhook de pedido único
// ============================================================

export async function processOrderWebhook(payload: ShopifyOrder): Promise<void> {
  if (!payload.customer?.id) return;

  const customer = await db.customer.findFirst({
    where: { shopifyId: String(payload.customer.id) },
  });
  if (!customer) return;

  await syncOrders([payload], () => {});
}
