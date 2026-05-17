/**
 * Importa carrinhos abandonados históricos do Shopify.
 * Busca checkouts abertos (não finalizados) de um período.
 * Rodar: npm run carts:import
 */

import { PrismaClient } from "@prisma/client";
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
const DOMAIN  = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN!;
const API_V   = process.env.SHOPIFY_API_VERSION ?? "2024-01";
const BASE    = `https://${DOMAIN}/admin/api/${API_V}`;
const HEADERS = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function nextCursor(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<[^>]+[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return m ? m[1] : null;
}

interface ShopifyCheckout {
  id: number;
  token: string;
  email: string | null;
  total_price: string;
  currency: string;
  abandoned_checkout_url: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  line_items: Array<{
    product_id: number | null;
    variant_id: number | null;
    title: string;
    variant_title: string | null;
    quantity: number;
    price: string;
    sku: string | null;
  }>;
}

async function fetchAbandonedCarts(dateMin: string, dateMax: string): Promise<ShopifyCheckout[]> {
  const all: ShopifyCheckout[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${BASE}/checkouts.json`);
    url.searchParams.set("limit", "250");
    url.searchParams.set("status", "open");
    if (cursor) {
      url.searchParams.set("page_info", cursor);
    } else {
      url.searchParams.set("created_at_min", dateMin);
      url.searchParams.set("created_at_max", dateMax);
    }

    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Shopify ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json() as { checkouts: ShopifyCheckout[] };
    all.push(...(data.checkouts ?? []));
    cursor = nextCursor(res.headers.get("Link"));
    if (cursor) await sleep(300);
  } while (cursor);

  return all;
}

async function main() {
  // Maio de 2026
  const dateMin = "2026-05-01T00:00:00Z";
  const dateMax = "2026-05-31T23:59:59Z";

  console.log(`\n🛒 Importando carrinhos abandonados de maio/2026...\n`);

  const checkouts = await fetchAbandonedCarts(dateMin, dateMax);
  console.log(`  ${checkouts.length} checkouts abertos encontrados`);

  // Filtra os que não foram completados
  const abandoned = checkouts.filter(c => !c.completed_at && c.line_items?.length > 0);
  console.log(`  ${abandoned.length} abandonados (sem itens ou completados ignorados)\n`);

  if (abandoned.length === 0) {
    console.log("Nenhum carrinho abandonado para importar.");
    return;
  }

  // Carrega emails de clientes para vincular
  const emails = [...new Set(abandoned.filter(c => c.email).map(c => c.email!.toLowerCase().trim()))];
  const customers = await db.customer.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const customerMap = new Map(customers.map(c => [c.email, c.id]));
  console.log(`  ${customerMap.size}/${emails.length} emails vinculados a clientes\n`);

  let ok = 0, skip = 0;
  for (const c of abandoned) {
    try {
      const email = c.email?.toLowerCase().trim() ?? null;
      const customerId = email ? (customerMap.get(email) ?? null) : null;

      const lineItems = c.line_items.map(i => ({
        productId: i.product_id ? String(i.product_id) : null,
        variantId: i.variant_id ? String(i.variant_id) : null,
        title: i.title ?? "",
        variantTitle: i.variant_title ?? null,
        quantity: Number(i.quantity) || 1,
        price: parseFloat(i.price ?? "0"),
        sku: i.sku ?? null,
      }));

      await db.abandonedCart.upsert({
        where: { shopifyCheckoutId: String(c.id) },
        create: {
          shopifyCheckoutId: String(c.id),
          customerId,
          email,
          totalPrice: parseFloat(c.total_price ?? "0"),
          currency: c.currency ?? "BRL",
          checkoutUrl: c.abandoned_checkout_url ?? null,
          lineItems,
          abandonedAt: new Date(c.updated_at),
        },
        update: {
          customerId,
          checkoutUrl: c.abandoned_checkout_url ?? null,
          lineItems,
          totalPrice: parseFloat(c.total_price ?? "0"),
          abandonedAt: new Date(c.updated_at),
        },
      });
      ok++;
    } catch { skip++; }
  }

  console.log(`✅ ${ok} importados, ${skip} erros`);
  console.log(`\n🎉 Acesse /carrinhos no CRM para ver os carrinhos abandonados de maio.`);
}

main()
  .catch(e => { console.error("❌ Erro:", e); process.exit(1); })
  .finally(() => db.$disconnect());
