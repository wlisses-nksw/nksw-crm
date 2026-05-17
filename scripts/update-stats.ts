/**
 * Recalcula stats de todos os clientes + RFM.
 * Rodar após qualquer importação: npm run stats:update
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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const isConnError = e instanceof Error && e.message.includes("Can't reach database");
      if (isConnError && i < retries - 1) {
        console.log(`\n  ⚠️  Conexão perdida, tentando novamente em ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries reached");
}

async function main() {
  console.log("📊 Atualizando estatísticas de clientes...\n");

  // Um único UPDATE com JOIN de agregação — muito mais rápido que N queries
  console.log("  Calculando agregações via SQL...");
  await db.$executeRaw`
    UPDATE customers c
    SET
      "ordersCount"       = sub.cnt,
      "totalSpent"        = sub.total,
      "averageOrderValue" = sub.avg_val,
      "lastOrderAt"       = sub.last_at,
      "firstOrderAt"      = sub.first_at,
      "updatedAt"         = NOW()
    FROM (
      SELECT
        "customerId",
        COUNT(*)::int                          AS cnt,
        SUM("totalPrice")                      AS total,
        AVG("totalPrice")                      AS avg_val,
        MAX("createdAt")                       AS last_at,
        MIN("createdAt")                       AS first_at
      FROM orders
      WHERE "financialStatus" = 'PAID'
      GROUP BY "customerId"
    ) sub
    WHERE c.id = sub."customerId"
  `;

  const done = await db.customer.count({ where: { ordersCount: { gt: 0 } } });
  console.log(`  ✓ ${done.toLocaleString("pt-BR")} clientes atualizados\n`);

  console.log("🧮 Recalculando RFM...");

  // Busca todos os clientes com stats já atualizados
  const customers = await db.customer.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true, totalSpent: true, ordersCount: true, lastOrderAt: true },
  });

  // Calcula RFM em memória (puro JS, sem I/O)
  const { differenceInDays } = await import("date-fns");
  const BENCHMARKS = {
    recency:   [30, 60, 120, 180],
    frequency: [1, 2, 4, 6],
    monetary:  [200, 500, 1000, 2000],
  };

  function scoreR(d: Date | null) {
    if (!d) return 1;
    const days = differenceInDays(new Date(), d);
    if (days <= 30) return 5; if (days <= 60) return 4;
    if (days <= 120) return 3; if (days <= 180) return 2; return 1;
  }
  function scoreF(n: number) {
    if (n >= 6) return 5; if (n >= 4) return 4;
    if (n >= 2) return 3; if (n >= 1) return 2; return 1;
  }
  function scoreM(v: number) {
    if (v >= 2000) return 5; if (v >= 1000) return 4;
    if (v >= 500) return 3; if (v >= 200) return 2; return 1;
  }
  function getLabel(r: number, f: number, m: number): string {
    const rf = r * 10 + f;
    if (rf >= 55) return "Champions";
    if (r >= 4 && f >= 4) return "Loyal Customers";
    if (r >= 3 && f >= 3) return "Potential Loyalists";
    if (r >= 4 && f <= 1) return "Recent Customers";
    if (r >= 3 && f <= 2 && m >= 3) return "Promising";
    if (r === 3 && f === 3) return "Needs Attention";
    if (r >= 2 && f <= 2) return "About To Sleep";
    if (r <= 2 && f >= 3 && m >= 3) return "At Risk";
    if (r <= 1 && f >= 4 && m >= 4) return "Cannot Lose Them";
    if (r <= 2 && f <= 2) return "Hibernating";
    return "Lost";
  }
  const SEGMENT_MAP: Record<string, string> = {
    Champions: "VIP", "Loyal Customers": "VIP",
    "Potential Loyalists": "ALTO_POTENCIAL", Promising: "ALTO_POTENCIAL",
    "Recent Customers": "PRIMEIRA_COMPRA",
    "Needs Attention": "EM_RISCO", "About To Sleep": "EM_RISCO",
    "At Risk": "EM_RISCO", "Cannot Lose Them": "EM_RISCO",
    Hibernating: "INATIVO", Lost: "INATIVO",
  };

  const rfmResults = customers.map(c => {
    const r = scoreR(c.lastOrderAt);
    const f = scoreF(c.ordersCount ?? 0);
    const m = scoreM(Number(c.totalSpent ?? 0));
    const total = r * 100 + f * 10 + m;
    const label = getLabel(r, f, m);
    return { id: c.id, r, f, m, total, label, segment: SEGMENT_MAP[label] ?? "INATIVO" };
  });

  // Bulk UPDATE customers via unnest (1 query para todos)
  const ids      = rfmResults.map(x => x.id);
  const scores   = rfmResults.map(x => x.total);
  const recencies = rfmResults.map(x => x.r);
  const freqs    = rfmResults.map(x => x.f);
  const monets   = rfmResults.map(x => x.m);
  const labels   = rfmResults.map(x => x.label);
  const segments = rfmResults.map(x => x.segment);

  await db.$executeRaw`
    UPDATE customers SET
      "rfmScore"     = v.score::int,
      "rfmRecency"   = v.recency::int,
      "rfmFrequency" = v.freq::int,
      "rfmMonetary"  = v.monetary::int,
      "rfmLabel"     = v.label,
      segment        = v.segment::"CustomerSegment",
      "updatedAt"    = NOW()
    FROM (
      SELECT
        unnest(${ids}::text[])         AS id,
        unnest(${scores}::int[])       AS score,
        unnest(${recencies}::int[])    AS recency,
        unnest(${freqs}::int[])        AS freq,
        unnest(${monets}::int[])       AS monetary,
        unnest(${labels}::text[])      AS label,
        unnest(${segments}::text[])    AS segment
    ) AS v
    WHERE customers.id = v.id
  `;

  // Atualiza customer_scores: apaga os antigos e insere todos de vez
  await db.customerScore.deleteMany({ where: { scoreType: "rfm" } });
  await db.customerScore.createMany({
    data: rfmResults.map(x => ({
      customerId: x.id,
      scoreType: "rfm",
      score: x.total,
      label: x.label,
      metadata: { recency: x.r, frequency: x.f, monetary: x.m, total: x.total, label: x.label },
    })),
    skipDuplicates: true,
  });

  console.log(`  ✓ ${rfmResults.length.toLocaleString("pt-BR")} clientes com RFM atualizado\n`);

  console.log("🎉 Stats atualizadas!");
}

main()
  .catch(e => { console.error("❌ Erro:", e); process.exit(1); })
  .finally(() => db.$disconnect());
