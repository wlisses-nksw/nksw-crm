/**
 * Atualiza telefones dos clientes cruzando:
 *   1. /customers.json  → customer.phone
 *   2. /orders.json     → shipping_address.phone  (por ano em paralelo)
 *
 * Roda: npx tsx scripts/update-phones.ts
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
const HEADERS = { "X-Shopify-Access-Token": TOKEN };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function nextCursor(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<[^>]+[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return m ? m[1] : null;
}

// ── 1. Phones dos clientes (sequencial — ~160 páginas) ────────────────────────

async function fetchCustomerPhones(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | null = null;
  let page = 0;

  do {
    const url = new URL(`${BASE}/customers.json`);
    url.searchParams.set("limit", "250");
    url.searchParams.set("fields", "id,phone");
    if (cursor) url.searchParams.set("page_info", cursor);

    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) throw new Error(`customers ${res.status}`);
    const { customers } = await res.json() as { customers: { id: number; phone?: string }[] };
    cursor = nextCursor(res.headers.get("Link"));
    page++;

    for (const c of customers) {
      if (c.phone) map.set(String(c.id), c.phone);
    }
    process.stdout.write(`\r  customers: página ${page} (${map.size} com tel)...`);
    if (cursor) await sleep(250);
  } while (cursor);

  console.log();
  return map;
}

// ── 2. Phones de um ano de pedidos ────────────────────────────────────────────

async function fetchOrderPhonesForYear(
  year: number,
  phoneMap: Map<string, string>,
  counters: { pages: number; found: number },
) {
  let cursor: string | null = null;

  do {
    const url = new URL(`${BASE}/orders.json`);
    url.searchParams.set("limit", "250");
    url.searchParams.set("fields", "customer,shipping_address");
    if (cursor) {
      url.searchParams.set("page_info", cursor);
    } else {
      url.searchParams.set("status", "any");
      url.searchParams.set("created_at_min", `${year}-01-01T00:00:00Z`);
      url.searchParams.set("created_at_max", `${year + 1}-01-01T00:00:00Z`);
    }

    let res = await fetch(url.toString(), { headers: HEADERS });
    if (res.status === 429) { await sleep(2000); res = await fetch(url.toString(), { headers: HEADERS }); }
    if (!res.ok) throw new Error(`orders ${year} ${res.status}: ${await res.text()}`);
    const { orders } = await res.json() as {
      orders: {
        customer?: { id: number; phone?: string };
        shipping_address?: { phone?: string };
      }[];
    };
    cursor = nextCursor(res.headers.get("Link"));
    counters.pages++;

    for (const o of orders) {
      const custId = o.customer?.id ? String(o.customer.id) : null;
      if (!custId) continue;
      const phone = o.customer?.phone || o.shipping_address?.phone || null;
      if (!phone) continue;
      if (!phoneMap.has(custId)) {
        phoneMap.set(custId, phone);
        counters.found++;
      }
    }

    if (cursor) await sleep(250);
  } while (cursor);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Update Phones (customers + orders paralelo) ===\n");

  console.log("1. Buscando phones via /customers.json...");
  const phoneMap = await fetchCustomerPhones();
  console.log(`   Phones de clientes: ${phoneMap.size}`);

  console.log("\n2. Buscando phones via /orders.json (2 anos por vez)...");
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2015 + i);
  const counters = { pages: 0, found: 0 };

  const ticker = setInterval(() => {
    process.stdout.write(
      `\r  orders: ${counters.pages} páginas | +${counters.found} novos telefones...`
    );
  }, 500);

  // Concorrência limitada a 2 para respeitar rate limit do Shopify
  const CONCURRENCY = 2;
  for (let i = 0; i < years.length; i += CONCURRENCY) {
    await Promise.all(years.slice(i, i + CONCURRENCY).map(y => fetchOrderPhonesForYear(y, phoneMap, counters)));
  }
  clearInterval(ticker);

  console.log(`\r  orders: ${counters.pages} páginas | +${counters.found} novos telefones     `);
  console.log(`   Total consolidado: ${phoneMap.size} clientes com telefone`);

  console.log("\n3. Buscando clientes no banco (com shopifyId)...");
  const customers = await db.customer.findMany({
    where: { shopifyId: { not: null } },
    select: { id: true, shopifyId: true, phone: true },
  });
  console.log(`   Total no banco com shopifyId: ${customers.length}`);

  const toUpdate: { id: string; phone: string }[] = [];
  const toClear:  string[] = [];

  for (const c of customers) {
    const shopifyPhone = phoneMap.get(c.shopifyId!) ?? null;
    if (shopifyPhone === c.phone) continue;
    if (shopifyPhone) toUpdate.push({ id: c.id, phone: shopifyPhone });
    else if (c.phone) toClear.push(c.id);
  }

  console.log(`\n   Ganham/trocam telefone: ${toUpdate.length}`);
  console.log(`   Perdem telefone:         ${toClear.length}`);

  if (toUpdate.length === 0 && toClear.length === 0) {
    console.log("\n✓ Nenhuma alteração necessária.");
    await db.$disconnect();
    return;
  }

  const BATCH = 1000;

  if (toUpdate.length > 0) {
    console.log("\n4. Atualizando no banco (SQL bulk)...");
    let done = 0;
    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const batch = toUpdate.slice(i, i + BATCH);
      // UPDATE customers SET phone = data.phone FROM (VALUES ...) WHERE id = data.id
      const values = batch.map((_, j) => `($${j * 2 + 1}::text, $${j * 2 + 2}::text)`).join(", ");
      const params = batch.flatMap(c => [c.id, c.phone]);
      await db.$executeRawUnsafe(
        `UPDATE customers SET phone = data.phone, "updatedAt" = now()
         FROM (VALUES ${values}) AS data(id, phone)
         WHERE customers.id = data.id`,
        ...params
      );
      done += batch.length;
      process.stdout.write(`\r  ${done}/${toUpdate.length}...`);
    }
    console.log();
  }

  if (toClear.length > 0) {
    console.log("5. Zerando removidos do Shopify...");
    await db.customer.updateMany({ where: { id: { in: toClear } }, data: { phone: null } });
  }

  console.log(`\n=== Concluído ===`);
  console.log(`  Atualizados: ${toUpdate.length}`);
  console.log(`  Zerados:     ${toClear.length}`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
