/**
 * Importação histórica completa: Shopify → Supabase
 * Rodar UMA VEZ: npm run db:import
 *
 * Busca todos os clientes e pedidos da loja com paginação real (Link header)
 * e popula o banco do zero. Depois o cron diário mantém atualizado.
 */

import { PrismaClient, type Prisma } from "@prisma/client";

// Carrega .env e .env.local manualmente
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

const HEADERS = {
  "X-Shopify-Access-Token": TOKEN,
  "Content-Type": "application/json",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextPageCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]+[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function shopifyFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<{ data: T; cursor: string | null }> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as T;
  const cursor = nextPageCursor(res.headers.get("Link"));
  return { data, cursor };
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function normalizeCustomer(c: ShopifyCustomer) {
  const address = c.addresses?.[0];
  return {
    shopifyId: String(c.id),
    email: (c.email ?? "").toLowerCase(),
    firstName: c.first_name ?? "",
    lastName: c.last_name ?? "",
    phone: c.phone ?? null,
    city: address?.city ?? null,
    state: address?.province ?? null,
    country: address?.country ?? "Brazil",
    zipCode: address?.zip ?? null,
    address: address?.address1 ?? null,
    totalSpent: parseFloat(c.total_spent ?? "0"),
    ordersCount: c.orders_count ?? 0,
    shopifyTags: c.tags ? c.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    acceptsMarketing: c.accepts_marketing ?? false,
    createdAt: new Date(c.created_at),
    lastOrderAt: c.last_order_id ? null : null, // será calculado dos pedidos
  };
}

function mapFinancialStatus(status: string) {
  const map: Record<string, string> = {
    pending: "PENDING", authorized: "PENDING", partially_paid: "PENDING",
    paid: "PAID", partially_refunded: "PAID",
    refunded: "REFUNDED",
    voided: "CANCELLED",
  };
  return (map[status] ?? "PENDING") as "PENDING" | "PAID" | "REFUNDED" | "CANCELLED" | "FULFILLED";
}

function normalizeOrder(o: ShopifyOrder, customerId: string) {
  return {
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
    shopifyTags: o.tags ? o.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    note: o.note ?? null,
    processedAt: o.processed_at ? new Date(o.processed_at) : null,
    cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
    createdAt: new Date(o.created_at),
  };
}

// ── Fetch all pages ───────────────────────────────────────────────────────────

async function fetchAllCustomers(): Promise<ShopifyCustomer[]> {
  const all: ShopifyCustomer[] = [];
  let cursor: string | null = null;
  let page = 1;

  do {
    const params: Record<string, string | number> = { limit: 250 };
    if (cursor) params.page_info = cursor;

    const { data, cursor: next } = await shopifyFetch<{ customers: ShopifyCustomer[] }>(
      "/customers.json",
      params
    );

    all.push(...data.customers);
    cursor = next;
    process.stdout.write(`\r  Clientes: ${all.length} (página ${page++})`);
    if (cursor) await sleep(300);
  } while (cursor);

  console.log();
  return all;
}

async function fetchAllOrders(): Promise<ShopifyOrder[]> {
  const all: ShopifyOrder[] = [];
  let cursor: string | null = null;
  let page = 1;

  do {
    const params: Record<string, string | number> = { limit: 250 };
    if (cursor) {
      params.page_info = cursor;
    } else {
      params.status = "any";
      params.financial_status = "paid";
      params.created_at_min = "2014-01-01T00:00:00Z";
    }

    const { data, cursor: next } = await shopifyFetch<{ orders: ShopifyOrder[] }>(
      "/orders.json",
      params
    );

    all.push(...data.orders);
    cursor = next;
    process.stdout.write(`\r  Pedidos: ${all.length} (página ${page++})`);
    if (cursor) await sleep(300);
  } while (cursor);

  console.log();
  return all;
}

// ── Import logic ─────────────────────────────────────────────────────────────

async function importCustomers(customers: ShopifyCustomer[]) {
  console.log(`\n📥 Importando ${customers.length} clientes...`);
  let ok = 0, skip = 0;

  // Processar em lotes de 50 paralelos
  const BATCH = 50;
  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (c) => {
        if (!c.email) { skip++; return; }
        try {
          const data = normalizeCustomer(c);
          await db.customer.upsert({
            where: { shopifyId: data.shopifyId },
            create: { ...data, firstOrderAt: null },
            update: { ...data, updatedAt: new Date() },
          });
          ok++;
        } catch {
          skip++;
        }
      })
    );
    process.stdout.write(`\r  ${ok}/${customers.length} importados, ${skip} ignorados`);
  }
  console.log(`\n  ✓ ${ok} clientes importados, ${skip} ignorados`);
}

async function importOrders(orders: ShopifyOrder[]) {
  console.log(`\n📥 Importando ${orders.length} pedidos...`);
  let ok = 0, skip = 0;

  // Construir mapa shopifyId → customerId para evitar N queries
  const shopifyIds = [...new Set(
    orders.filter(o => o.customer?.id).map(o => String(o.customer!.id))
  )];

  console.log(`  Buscando ${shopifyIds.length} clientes no banco...`);
  const dbCustomers = await db.customer.findMany({
    where: { shopifyId: { in: shopifyIds } },
    select: { id: true, shopifyId: true },
  });
  const customerMap = new Map(dbCustomers.map(c => [c.shopifyId, c.id]));

  for (const o of orders) {
    try {
      if (!o.customer?.id) { skip++; continue; }
      const customerId = customerMap.get(String(o.customer.id));
      if (!customerId) { skip++; continue; }

      const data = normalizeOrder(o, customerId);
      const order = await db.order.upsert({
        where: { shopifyId: data.shopifyId },
        create: data,
        update: { ...data, updatedAt: new Date() },
      });

      // Line items
      if (o.line_items?.length) {
        await db.lineItem.deleteMany({ where: { orderId: order.id } });
        await db.lineItem.createMany({
          data: o.line_items.map((item: ShopifyLineItem) => ({
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
    } catch {
      skip++;
    }
    if (ok % 100 === 0) process.stdout.write(`\r  ${ok}/${orders.length} importados`);
  }
  console.log(`\n  ✓ ${ok} pedidos importados, ${skip} ignorados`);
}

async function updateCustomerStats() {
  console.log("\n📊 Atualizando estatísticas dos clientes...");
  const customers = await db.customer.findMany({ select: { id: true } });

  let done = 0;
  const BATCH = 100;
  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (c) => {
        const orders = await db.order.findMany({
          where: { customerId: c.id, financialStatus: "PAID" },
          select: { totalPrice: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });
        if (orders.length === 0) return;
        const totalSpent = orders.reduce((s, o) => s + Number(o.totalPrice), 0);
        await db.customer.update({
          where: { id: c.id },
          data: {
            ordersCount: orders.length,
            totalSpent,
            averageOrderValue: totalSpent / orders.length,
            lastOrderAt: orders[0].createdAt,
            firstOrderAt: orders[orders.length - 1].createdAt,
          },
        });
        done++;
      })
    );
    process.stdout.write(`\r  ${done}/${customers.length}`);
  }
  console.log(`\n  ✓ ${done} clientes atualizados`);
}

async function recalculateRFM() {
  console.log("\n🧮 Recalculando RFM...");
  // Importa dinamicamente para evitar dependências circulares
  const { recalculateAllRFM } = await import("../src/services/rfm.service.js");
  await recalculateAllRFM();
  console.log("  ✓ RFM recalculado");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 NKSW CRM — Importação histórica completa\n");
  console.log(`   Loja: ${DOMAIN}`);
  console.log(`   Banco: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "..."}\n`);

  const startTime = Date.now();

  try {
    // 1. Buscar dados do Shopify
    console.log("🔄 Buscando dados do Shopify...");
    const [customers, orders] = await Promise.all([
      fetchAllCustomers(),
      fetchAllOrders(),
    ]);

    console.log(`\n✅ Shopify: ${customers.length} clientes, ${orders.length} pedidos\n`);

    // 2. Importar clientes primeiro
    await importCustomers(customers);

    // 3. Importar pedidos
    await importOrders(orders);

    // 4. Recalcular stats
    await updateCustomerStats();

    // 5. Recalcular RFM
    try {
      await recalculateRFM();
    } catch (e) {
      console.log("  ⚠️  RFM skipped:", e instanceof Error ? e.message : e);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 Importação concluída em ${elapsed}s!`);
    console.log("   Acesse o CRM para ver os clientes importados.\n");
  } catch (err) {
    console.error("\n❌ Erro:", err);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  total_spent: string;
  orders_count: number;
  tags: string;
  accepts_marketing: boolean;
  created_at: string;
  last_order_id: number | null;
  addresses?: Array<{
    city?: string; province?: string; country?: string;
    zip?: string; address1?: string;
  }>;
}

interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  tags: string;
  note: string | null;
  processed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  customer?: { id: number };
  shipping_address?: { city?: string; province?: string; country?: string; zip?: string };
  discount_codes?: unknown[];
  line_items: ShopifyLineItem[];
}

interface ShopifyLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  total_discount: string;
}
