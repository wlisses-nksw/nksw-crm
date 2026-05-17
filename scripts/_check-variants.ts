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

async function main() {
  const c = await db.customer.findFirst({
    where: { email: "neyacosta@joaotancredo.adv.br" },
    select: { id: true },
  });
  if (!c) { console.log("cliente não encontrado"); return; }

  const items = await db.lineItem.findMany({
    where: { order: { customerId: c.id } },
    select: { title: true, variantTitle: true },
    take: 30,
    orderBy: { id: "desc" },
  });

  console.log(`\n${items.length} line items encontrados:\n`);
  for (const i of items) {
    console.log(`variant: "${i.variantTitle}" | title: "${i.title.slice(0, 50)}"`);
  }

  // Também mostra amostra geral de variants distintos
  const sample = await db.$queryRaw<Array<{ variantTitle: string; cnt: bigint }>>`
    SELECT "variantTitle", COUNT(*)::bigint AS cnt
    FROM line_items
    WHERE "variantTitle" IS NOT NULL AND "variantTitle" != ''
    GROUP BY "variantTitle"
    ORDER BY cnt DESC
    LIMIT 30
  `;
  console.log("\nTop 30 variantTitles no banco:");
  for (const r of sample) console.log(`  "${r.variantTitle}" (${r.cnt}x)`);
}

main().catch(console.error).finally(() => db.$disconnect());
