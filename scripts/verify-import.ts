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
  const [totalCustomers, totalOrders, totalLineItems] = await Promise.all([
    db.customer.count(),
    db.order.count(),
    db.lineItem.count(),
  ]);

  console.log(`\n📊 Resumo do banco\n`);
  console.log(`  Clientes:    ${totalCustomers.toLocaleString("pt-BR")}`);
  console.log(`  Pedidos:     ${totalOrders.toLocaleString("pt-BR")}`);
  console.log(`  Itens:       ${totalLineItems.toLocaleString("pt-BR")}  (média ${(totalLineItems/totalOrders).toFixed(1)} itens/pedido)\n`);

  const byYear = await db.$queryRaw<Array<{ ano: string; total: bigint; receita: number }>>`
    SELECT EXTRACT(YEAR FROM "createdAt")::text AS ano,
           COUNT(*)                             AS total,
           SUM("totalPrice")::float             AS receita
    FROM orders
    WHERE "financialStatus" = 'PAID'
    GROUP BY ano
    ORDER BY ano
  `;

  console.log("  Pedidos pagos por ano:");
  console.log("  ──────────────────────────────────────────────────────");
  for (const row of byYear) {
    const receita = Number(row.receita).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const media = Number(row.receita) / Number(row.total);
    const ticket = media.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    console.log(`  ${row.ano}  │  ${String(row.total).padStart(5)} pedidos  │  ${receita.padStart(18)}  │  ticket médio ${ticket}`);
  }

  const nuvem = await db.order.count({ where: { shopifyId: { startsWith: "nuvem_" } } });
  const shopify = await db.order.count({ where: { shopifyId: { not: { startsWith: "nuvem_" } } } });

  // Amostra de pedidos para verificar integridade
  const sample = await db.order.findMany({
    take: 3,
    orderBy: { createdAt: "asc" },
    select: {
      orderNumber: true, createdAt: true, totalPrice: true, financialStatus: true,
      lineItems: { select: { title: true, quantity: true, price: true } }
    }
  });

  console.log(`\n  Origem:`);
  console.log(`  Shopify:    ${shopify.toLocaleString("pt-BR")} pedidos`);
  console.log(`  Nuvem Shop: ${nuvem.toLocaleString("pt-BR")} pedidos`);

  console.log(`\n  Amostra (3 pedidos mais antigos):`);
  for (const o of sample) {
    console.log(`  #${o.orderNumber} | ${o.createdAt.toLocaleDateString("pt-BR")} | R$${Number(o.totalPrice).toFixed(2)} | ${o.lineItems.length} itens`);
    for (const li of o.lineItems) {
      console.log(`    - ${li.title} x${li.quantity} @ R$${Number(li.price).toFixed(2)}`);
    }
  }

  await db.$disconnect();
}

main().catch(console.error);
