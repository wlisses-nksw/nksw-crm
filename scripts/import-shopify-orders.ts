/**
 * Importa TODOS os pedidos do Shopify (2015→hoje) exceto cancelados.
 * Não re-importa clientes já existentes, mas cria os que faltam (resolve 2015-2019).
 * Rodar: npm run shopify:orders
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(path: string) {
  try {
    const content = readFileSync(resolve(path), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}
loadEnv(".env");
loadEnv(".env.local");

const db = new PrismaClient();

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN  = process.env.SHOPIFY_ADMIN_TOKEN!;
const API_V  = process.env.SHOPIFY_API_VERSION ?? "2024-01";
const BASE   = `https://${DOMAIN}/admin/api/${API_V}`;
const HEADERS = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function nextCursor(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<[^>]+[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return m ? m[1] : null;
}

function mapFinancialStatus(s: string): "PENDING" | "PAID" | "REFUNDED" | "CANCELLED" | "FULFILLED" {
  const map: Record<string, "PENDING" | "PAID" | "REFUNDED" | "CANCELLED" | "FULFILLED"> = {
    pending: "PENDING", authorized: "PENDING", partially_paid: "PENDING",
    paid: "PAID", partially_refunded: "PAID",
    refunded: "REFUNDED", voided: "CANCELLED",
  };
  return map[s] ?? "PENDING";
}

interface ShopifyCustomerInOrder {
  id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  tags?: string;
  accepts_marketing?: boolean;
}

interface ShopifyOrder {
  id: number; order_number: number; email: string;
  total_price: string; subtotal_price: string; total_discounts: string; total_tax: string;
  currency: string; financial_status: string; fulfillment_status: string | null;
  tags: string; note: string | null; processed_at: string | null;
  cancelled_at: string | null; created_at: string;
  customer?: ShopifyCustomerInOrder;
  shipping_address?: { city?: string; province?: string; country?: string; zip?: string; address1?: string; phone?: string };
  discount_codes?: unknown[];
  line_items: Array<{
    id: number; product_id: number | null; variant_id: number | null;
    title: string; variant_title: string | null; sku: string | null;
    quantity: number; price: string; total_discount: string;
  }>;
}

async function fetchYear(year: number): Promise<ShopifyOrder[]> {
  const all: ShopifyOrder[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${BASE}/orders.json`);
    url.searchParams.set("limit", "250");
    if (cursor) {
      url.searchParams.set("page_info", cursor);
    } else {
      // Sem filtro financial_status — pega tudo exceto cancelados (filtramos em código)
      url.searchParams.set("status", "any");
      url.searchParams.set("created_at_min", `${year}-01-01T00:00:00Z`);
      url.searchParams.set("created_at_max", `${year + 1}-01-01T00:00:00Z`);
    }

    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json() as { orders: ShopifyOrder[] };
    all.push(...data.orders);
    cursor = nextCursor(res.headers.get("Link"));
    if (cursor) await sleep(300);
  } while (cursor);

  return all;
}

async function main() {
  console.log("🚀 NKSW CRM — Importação pedidos Shopify (todos exceto cancelados)\n");
  console.log(`   Loja: ${DOMAIN}\n`);

  // 1. Busca todos os pedidos ano a ano
  console.log("🔄 Buscando pedidos...");
  const allOrders: ShopifyOrder[] = [];
  const currentYear = new Date().getFullYear();

  for (let year = 2015; year <= currentYear; year++) {
    const chunk = await fetchYear(year);
    allOrders.push(...chunk);
    process.stdout.write(`\r  ${year}: ${chunk.length} pedidos | total: ${allOrders.length}  `);
    await sleep(300);
  }

  // Filtra cancelados em código
  const orders = allOrders.filter(o => !o.cancelled_at);
  const cancelados = allOrders.length - orders.length;
  console.log(`\n✅ ${allOrders.length} encontrados → ${orders.length} válidos, ${cancelados} cancelados ignorados\n`);

  // 2. Carrega mapa shopifyId → customerId do banco
  console.log("🔍 Carregando clientes do banco...");
  const shopifyIds = [...new Set(orders.filter(o => o.customer?.id).map(o => String(o.customer!.id)))];
  const dbCustomers = await db.customer.findMany({
    where: { shopifyId: { in: shopifyIds } },
    select: { id: true, shopifyId: true },
  });
  const customerMap = new Map(dbCustomers.map(c => [c.shopifyId!, c.id]));
  console.log(`  ${customerMap.size}/${shopifyIds.length} clientes já no banco\n`);

  // 3. Cria clientes ausentes (resolve pedidos de 2015-2019)
  const missingIds = shopifyIds.filter(sid => !customerMap.has(sid));
  if (missingIds.length > 0) {
    console.log(`👤 Criando ${missingIds.length} clientes ausentes...`);
    const missingSet = new Set(missingIds);

    // Pega o primeiro pedido de cada cliente ausente para extrair os dados
    const byCustomer = new Map<string, ShopifyOrder>();
    for (const o of orders) {
      if (o.customer?.id && missingSet.has(String(o.customer.id)) && !byCustomer.has(String(o.customer.id))) {
        byCustomer.set(String(o.customer.id), o);
      }
    }

    const entries = Array.from(byCustomer.entries());

    // Pré-filtra emails já existentes para evitar conflitos no createMany
    const candidateEmails = entries
      .map(([, o]) => (o.customer?.email || o.email || "").toLowerCase().trim())
      .filter(Boolean);
    const existing = await db.customer.findMany({
      where: { email: { in: candidateEmails } },
      select: { email: true, id: true, shopifyId: true },
    });
    const existingByEmail = new Map(existing.map(c => [c.email, c]));

    // Atualiza customerMap com os que já existem por email mas com shopifyId diferente
    for (const [shopifyId, o] of entries) {
      const email = (o.customer?.email || o.email || "").toLowerCase().trim();
      const found = existingByEmail.get(email);
      if (found) customerMap.set(shopifyId, found.id);
    }

    // Cria só os que realmente não existem
    const toCreate = entries
      .filter(([shopifyId, o]) => {
        const email = (o.customer?.email || o.email || "").toLowerCase().trim();
        return email && !existingByEmail.has(email) && !customerMap.has(shopifyId);
      })
      .map(([shopifyId, o]) => {
        const c = o.customer!;
        return {
          shopifyId,
          email: (c.email || o.email || "").toLowerCase().trim(),
          firstName: c.first_name ?? "",
          lastName: c.last_name ?? "",
          phone: c.phone || o.shipping_address?.phone || null,
          city: o.shipping_address?.city ?? null,
          state: o.shipping_address?.province ?? null,
          country: o.shipping_address?.country ?? "Brazil",
          zipCode: o.shipping_address?.zip ?? null,
          address: o.shipping_address?.address1 ?? null,
          shopifyTags: c.tags ? c.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
          acceptsMarketing: c.accepts_marketing ?? false,
          createdAt: new Date(o.created_at),
        };
      });

    // createMany em lotes de 500
    const CHUNK = 500;
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      await db.customer.createMany({ data: toCreate.slice(i, i + CHUNK), skipDuplicates: true });
      process.stdout.write(`\r  ${Math.min(i + CHUNK, toCreate.length)}/${toCreate.length}`);
    }

    // Recarrega mapa com os recém-criados
    const newShopifyIds = toCreate.map(c => c.shopifyId!).filter(Boolean);
    const newCustomers = await db.customer.findMany({
      where: { shopifyId: { in: newShopifyIds } },
      select: { id: true, shopifyId: true },
    });
    for (const c of newCustomers) customerMap.set(c.shopifyId!, c.id);

    console.log(`\n  ✓ ${newCustomers.length} clientes criados\n`);
  }

  // 4. Importa pedidos em lotes paralelos
  console.log("📥 Importando pedidos...");
  let ok = 0, skip = 0;
  const BATCH = 20;

  for (let i = 0; i < orders.length; i += BATCH) {
    const batch = orders.slice(i, i + BATCH);
    await Promise.all(batch.map(async (o) => {
      try {
        if (!o.customer?.id) { skip++; return; }
        const customerId = customerMap.get(String(o.customer.id));
        if (!customerId) { skip++; return; }

        const data = {
          shopifyId: String(o.id),
          orderNumber: o.order_number,
          customerId,
          email: o.email ?? "",
          totalPrice: parseFloat(o.total_price ?? "0"),
          subtotalPrice: parseFloat(o.subtotal_price ?? "0"),
          totalDiscounts: parseFloat(o.total_discounts ?? "0"),
          totalTax: parseFloat(o.total_tax ?? "0"),
          currency: o.currency ?? "BRL",
          financialStatus: mapFinancialStatus(o.financial_status),
          fulfillmentStatus: o.fulfillment_status ?? null,
          shippingCity: o.shipping_address?.city ?? null,
          shippingState: o.shipping_address?.province ?? null,
          shippingCountry: o.shipping_address?.country ?? null,
          shippingZip: o.shipping_address?.zip ?? null,
          discountCodes: (o.discount_codes ?? []) as Prisma.InputJsonValue,
          shopifyTags: o.tags ? o.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
          note: o.note ?? null,
          processedAt: o.processed_at ? new Date(o.processed_at) : null,
          cancelledAt: null,
          createdAt: new Date(o.created_at),
        };

        const order = await db.order.upsert({
          where: { shopifyId: data.shopifyId },
          create: data,
          update: { ...data, updatedAt: new Date() },
        });

        if (o.line_items?.length) {
          await db.lineItem.deleteMany({ where: { orderId: order.id } });
          await db.lineItem.createMany({
            data: o.line_items.map(item => ({
              orderId: order.id,
              shopifyItemId: String(item.id),
              productId: item.product_id ? String(item.product_id) : null,
              variantId: item.variant_id ? String(item.variant_id) : null,
              title: item.title ?? "",
              variantTitle: item.variant_title ?? null,
              sku: item.sku ?? null,
              quantity: item.quantity ?? 1,
              price: parseFloat(item.price ?? "0"),
              totalDiscount: parseFloat(item.total_discount ?? "0"),
            })),
          });
        }
        ok++;
      } catch { skip++; }
    }));
    process.stdout.write(`\r  ${ok + skip}/${orders.length} (${ok} ok, ${skip} sem cliente)`);
  }

  console.log(`\n  ✓ ${ok} importados, ${skip} ignorados\n`);
  console.log(`🎉 Concluído! Rode agora: npm run stats:update`);
}

main()
  .catch(e => { console.error("❌ Erro:", e); process.exit(1); })
  .finally(() => db.$disconnect());
