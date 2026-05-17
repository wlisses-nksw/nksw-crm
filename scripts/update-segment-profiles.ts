/**
 * Atualiza perfis de segmento com padrões de compra agregados — sem IA, só SQL.
 * Rodar mensalmente: npm run segment:update
 *
 * O que grava por segmento:
 *  - topProducts: 20 produtos mais comprados
 *  - nextBuyProducts: sequências "depois de X, compram Y" (top 5 por produto)
 *  - avgTicket, avgOrdersPerYear, avgDaysBetween, totalCustomers
 *  - summary: texto descritivo gerado localmente (sem chamada de IA)
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

const SEGMENTS = ["VIP", "ALTO_POTENCIAL", "PRIMEIRA_COMPRA", "EM_RISCO", "INATIVO"] as const;

async function buildSegmentProfile(segment: string) {
  // 1. Estatísticas gerais do segmento
  const stats = await db.$queryRaw<Array<{
    total_customers: bigint;
    avg_ticket: number;
    avg_orders: number;
    avg_days_between: number;
  }>>`
    SELECT
      COUNT(DISTINCT c.id)::bigint                                    AS total_customers,
      AVG(c."averageOrderValue")::float                               AS avg_ticket,
      AVG(c."ordersCount")::float                                     AS avg_orders,
      AVG(
        CASE WHEN c."ordersCount" > 1 AND c."firstOrderAt" IS NOT NULL
          THEN EXTRACT(EPOCH FROM (c."lastOrderAt" - c."firstOrderAt")) / 86400.0
               / NULLIF(c."ordersCount" - 1, 0)
          ELSE NULL
        END
      )::float                                                         AS avg_days_between
    FROM customers c
    WHERE c.segment = ${segment}::"CustomerSegment"
      AND c."deletedAt" IS NULL
      AND c.active = true
      AND c."ordersCount" > 0
  `;

  // 2. Top 20 produtos mais comprados no segmento
  const topProductsRaw = await db.$queryRaw<Array<{ title: string; total: bigint }>>`
    SELECT
      split_part(li.title, ' - ', 1)  AS title,
      SUM(li.quantity)::bigint         AS total
    FROM line_items li
    JOIN orders o     ON o.id = li."orderId"
    JOIN customers c  ON c.id = o."customerId"
    WHERE c.segment = ${segment}::"CustomerSegment"
      AND o."financialStatus" = 'PAID'
      AND c."deletedAt" IS NULL
    GROUP BY split_part(li.title, ' - ', 1)
    ORDER BY total DESC
    LIMIT 20
  `;

  // 3. Sequências: "clientes que compraram X também compraram Y"
  // Busca pares de produtos co-ocorrentes nos pedidos do segmento
  const sequences = await db.$queryRaw<Array<{ product_a: string; product_b: string; co_count: bigint }>>`
    WITH order_products AS (
      SELECT
        o."customerId",
        o.id AS order_id,
        split_part(li.title, ' - ', 1) AS product
      FROM line_items li
      JOIN orders o    ON o.id = li."orderId"
      JOIN customers c ON c.id = o."customerId"
      WHERE c.segment = ${segment}::"CustomerSegment"
        AND o."financialStatus" = 'PAID'
        AND c."deletedAt" IS NULL
      GROUP BY o."customerId", o.id, split_part(li.title, ' - ', 1)
    ),
    customer_products AS (
      SELECT "customerId", array_agg(DISTINCT product ORDER BY product) AS products
      FROM order_products
      GROUP BY "customerId"
      HAVING array_length(array_agg(DISTINCT product), 1) > 1
    ),
    pairs AS (
      SELECT
        p1 AS product_a,
        p2 AS product_b
      FROM customer_products,
           unnest(products) AS p1,
           unnest(products) AS p2
      WHERE p1 < p2
    )
    SELECT product_a, product_b, COUNT(*)::bigint AS co_count
    FROM pairs
    GROUP BY product_a, product_b
    ORDER BY co_count DESC
    LIMIT 50
  `;

  // Transforma pares em mapa { produto → [produtos relacionados] }
  const nextBuyMap = new Map<string, { product: string; count: number }[]>();
  for (const { product_a, product_b, co_count } of sequences) {
    const count = Number(co_count);
    if (!nextBuyMap.has(product_a)) nextBuyMap.set(product_a, []);
    if (!nextBuyMap.has(product_b)) nextBuyMap.set(product_b, []);
    nextBuyMap.get(product_a)!.push({ product: product_b, count });
    nextBuyMap.get(product_b)!.push({ product: product_a, count });
  }
  const nextBuyProducts = Array.from(nextBuyMap.entries())
    .map(([after, related]) => ({
      after,
      buyNext: related.sort((a, b) => b.count - a.count).slice(0, 3).map(r => r.product),
    }))
    .slice(0, 20);

  const s = stats[0];
  const topProducts = topProductsRaw.map(p => p.title.trim()).filter(Boolean);
  const avgTicket = Math.round(Number(s?.avg_ticket ?? 0));
  const avgOrdersPerYear = Math.round((Number(s?.avg_orders ?? 0) / Math.max(1, 1)) * 10) / 10;
  const avgDaysBetween = Math.round(Number(s?.avg_days_between ?? 0));
  const totalCustomers = Number(s?.total_customers ?? 0);

  const summary = `Segmento ${segment}: ${totalCustomers} clientes, ticket médio R$${avgTicket}, ` +
    `intervalo médio entre compras ${avgDaysBetween} dias. ` +
    `Produtos mais populares: ${topProducts.slice(0, 5).join(", ")}.`;

  return {
    segment,
    topProducts,
    nextBuyProducts,
    avgTicket,
    avgOrdersPerYear,
    avgDaysBetween,
    totalCustomers,
    summary,
  };
}

async function main() {
  console.log("🧩 Atualizando perfis de segmento (sem IA)...\n");

  for (const segment of SEGMENTS) {
    process.stdout.write(`  ${segment}...`);
    const profile = await buildSegmentProfile(segment);

    await db.segmentProfile.upsert({
      where: { segment },
      create: profile,
      update: profile,
    });

    console.log(
      ` ✓  ${profile.totalCustomers} clientes | ticket R$${profile.avgTicket} | ` +
      `${profile.topProducts.length} produtos | ${profile.nextBuyProducts.length} sequências`
    );
  }

  console.log("\n🎉 Perfis de segmento atualizados! Clientes verão recomendações personalizadas.");
}

main()
  .catch(e => { console.error("❌ Erro:", e); process.exit(1); })
  .finally(() => db.$disconnect());
