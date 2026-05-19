import { NextRequest, NextResponse } from "next/server";
import { auth, hasPermission } from "@/lib/auth";
import { fetchCustomerByEmail, fetchOrdersByEmail } from "@/lib/shopify";
import { db } from "@/lib/db";
import { normalizeShopifyCustomer, normalizeShopifyOrder } from "@/lib/shopify";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!hasPermission(session.user.role, "SUPERVISOR")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email obrigatório" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 1. Busca cliente no Shopify por email
  const shopifyCustomer = await fetchCustomerByEmail(normalizedEmail);

  let customerId: string | null = null;

  if (shopifyCustomer) {
    const normalized = normalizeShopifyCustomer(shopifyCustomer);
    const record = await db.customer.upsert({
      where: { shopifyId: normalized.shopifyId },
      create: { ...normalized, firstOrderAt: normalized.lastOrderAt },
      update: { ...normalized, updatedAt: new Date() },
    });
    customerId = record.id;
  } else {
    // Tenta achar no banco por email
    const found = await db.customer.findFirst({ where: { email: normalizedEmail } });
    if (found) customerId = found.id;
  }

  // 2. Busca todos os pedidos por email no Shopify
  const orders = await fetchOrdersByEmail(normalizedEmail);
  let synced = 0;

  for (const so of orders) {
    try {
      // Resolve customerId: usa o que já temos ou tenta pelo shopifyId do pedido
      let cid = customerId;
      if (!cid && so.customer?.id) {
        const c = await db.customer.findFirst({ where: { shopifyId: String(so.customer.id) } });
        cid = c?.id ?? null;
      }
      if (!cid) continue;

      const normalized = normalizeShopifyOrder(so, cid);
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

      // Atualiza stats
      const allOrders = await db.order.findMany({
        where: { customerId: cid, financialStatus: "PAID" },
        select: { totalPrice: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      if (allOrders.length > 0) {
        const totalSpent = allOrders.reduce((s, o) => s + Number(o.totalPrice), 0);
        await db.customer.update({
          where: { id: cid },
          data: {
            ordersCount: allOrders.length,
            totalSpent,
            averageOrderValue: totalSpent / allOrders.length,
            lastOrderAt: allOrders[0].createdAt,
            firstOrderAt: allOrders[allOrders.length - 1].createdAt,
          },
        });
      }

      synced++;
    } catch (err) {
      console.error("[sync-customer] pedido", so.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    email: normalizedEmail,
    customerFound: !!customerId,
    ordersTotal: orders.length,
    ordersSynced: synced,
  });
}
