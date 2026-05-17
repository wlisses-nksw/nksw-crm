/**
 * Importação histórica: Nuvem Shop CSV → Supabase
 * Rodar UMA VEZ: npm run nuvem:import
 *
 * Lê o CSV exportado da Nuvem Shop e popula clientes + pedidos no banco.
 * Pedidos com pagamento não confirmado são ignorados.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Carrega .env ──────────────────────────────────────────────────────────────

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

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      // quoted field
      i++;
      let val = "";
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          val += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          val += line[i++];
        }
      }
      // Excel formula ="value" → value
      if (val.startsWith("=")) val = val.replace(/^="?|"?$/g, "");
      fields.push(val.trim());
      if (line[i] === ";") i++;
    } else {
      // unquoted field
      const end = line.indexOf(";", i);
      if (end === -1) {
        fields.push(line.slice(i).trim());
        break;
      } else {
        fields.push(line.slice(i, end).trim());
        i = end + 1;
      }
    }
  }
  return fields;
}

// ── Date parser ───────────────────────────────────────────────────────────────

// "30/04/2026 21:49:42" → Date
function parseBRDate(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", sec = "0"] = m;
  return new Date(`${y}-${mo}-${d}T${h.padStart(2,"0")}:${mi.padStart(2,"0")}:${sec.padStart(2,"0")}-03:00`);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapPaymentStatus(s: string): "PENDING" | "PAID" | "REFUNDED" | "CANCELLED" | "FULFILLED" {
  if (s === "Confirmado") return "PAID";
  if (s === "Cancelado" || s === "Estornado") return "CANCELLED";
  if (s === "Reembolsado") return "REFUNDED";
  return "PENDING";
}

function mapFulfillmentStatus(s: string): string | null {
  if (s === "Entregue") return "fulfilled";
  if (s === "Enviado") return "partial";
  return null;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedOrder {
  orderNumDisplay: number;    // "Número do Pedido" (ex: 4486)
  nuvemdId: string;           // "Identificador do pedido" (ex: 1958517038)
  email: string;
  date: Date | null;
  statusPedido: string;
  statusPagamento: string;
  statusEnvio: string;
  subtotal: number;
  desconto: number;
  frete: number;
  total: number;
  nomeComprador: string;
  telefone: string;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  pais: string;
  formaPagamento: string;
  cupom: string;
  notaComprador: string;
  notaVendedor: string;
  dataPagamento: Date | null;
  cancelledAt: Date | null;
  lineItems: Array<{
    idx: number;
    title: string;
    price: number;
    quantity: number;
    sku: string;
  }>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Localiza o CSV (aceita caminho como argumento ou usa o padrão)
  const csvPath = process.argv[2] ?? resolve(
    process.env.HOME ?? process.env.USERPROFILE ?? ".",
    "Downloads",
    "Vendas-553041e2-1724-4372-85c3-ead39b47282c.csv"
  );

  console.log("🚀 NKSW CRM — Importação Nuvem Shop\n");
  console.log(`   CSV: ${csvPath}`);
  console.log(`   Banco: ${process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? "..."}\n`);

  // Lê arquivo em latin1 (encoding padrão dos exports brasileiros)
  const raw = readFileSync(csvPath, "latin1");
  const lines = raw.split("\n").map(l => l.replace(/\r$/, ""));

  // Pula cabeçalho
  const dataLines = lines.slice(1).filter(l => l.trim().length > 0);

  console.log(`📄 ${dataLines.length} linhas de dados encontradas\n`);

  // ── Agrupa linhas por número do pedido ────────────────────────────────────

  const ordersMap = new Map<string, ParsedOrder>();

  for (const line of dataLines) {
    const f = parseCSVLine(line);

    const orderNum = f[0];
    if (!orderNum || isNaN(Number(orderNum))) continue;

    const isFirstRow = !!f[2]; // Data só aparece na primeira linha de cada pedido

    if (isFirstRow) {
      const nuvemdId = f[38] || `nuvem_num_${orderNum}`;
      ordersMap.set(orderNum, {
        orderNumDisplay: parseInt(orderNum),
        nuvemdId,
        email: (f[1] ?? "").toLowerCase().trim(),
        date: parseBRDate(f[2]),
        statusPedido: f[3] ?? "",
        statusPagamento: f[4] ?? "",
        statusEnvio: f[5] ?? "",
        subtotal: parseFloat(f[7]?.replace(",", ".") ?? "0") || 0,
        desconto: parseFloat(f[8]?.replace(",", ".") ?? "0") || 0,
        frete: parseFloat(f[9]?.replace(",", ".") ?? "0") || 0,
        total: parseFloat(f[10]?.replace(",", ".") ?? "0") || 0,
        nomeComprador: f[11] ?? "",
        telefone: f[13] ?? "",
        endereco: `${f[16] ?? ""} ${f[17] ?? ""}`.trim(),
        cidade: f[20] ?? "",
        estado: f[22] ?? "",
        cep: f[21] ?? "",
        pais: f[23] ?? "Brasil",
        formaPagamento: f[25] ?? "",
        cupom: f[26] ?? "",
        notaComprador: f[27] ?? "",
        notaVendedor: f[28] ?? "",
        dataPagamento: parseBRDate(f[29]),
        cancelledAt: parseBRDate(f[43]),
        lineItems: [],
      });
    }

    // Produto (presente em todas as linhas)
    const order = ordersMap.get(orderNum);
    if (order && f[31]) {
      order.lineItems.push({
        idx: order.lineItems.length,
        title: f[31],
        price: parseFloat(f[32]?.replace(",", ".") ?? "0") || 0,
        quantity: parseInt(f[33] ?? "1") || 1,
        sku: f[34]?.replace(/^'/, "") ?? "", // remove aspas do SKU
      });
    }
  }

  const allOrders = Array.from(ordersMap.values());
  console.log(`📦 ${allOrders.length} pedidos únicos encontrados`);

  // Filtra apenas pedidos confirmados (pagos)
  const paidOrders = allOrders.filter(o => o.statusPagamento === "Confirmado");
  const skippedOrders = allOrders.length - paidOrders.length;
  console.log(`   ✓ ${paidOrders.length} pagos | ✗ ${skippedOrders} ignorados (não confirmados)\n`);

  // ── Importa clientes ──────────────────────────────────────────────────────

  console.log("👤 Importando clientes...");
  let custOk = 0, custSkip = 0;

  const BATCH = 50;
  for (let i = 0; i < paidOrders.length; i += BATCH) {
    const batch = paidOrders.slice(i, i + BATCH);
    await Promise.all(batch.map(async (o) => {
      if (!o.email) { custSkip++; return; }
      try {
        const { firstName, lastName } = splitName(o.nomeComprador || o.email.split("@")[0]);
        await db.customer.upsert({
          where: { email: o.email },
          create: {
            shopifyId: `nuvem_${o.email.replace(/[^a-z0-9]/gi, "_")}`,
            email: o.email,
            firstName,
            lastName,
            phone: o.telefone || null,
            city: o.cidade || null,
            state: o.estado || null,
            country: "Brazil",
            zipCode: o.cep || null,
            address: o.endereco || null,
            source: "MANUAL",
            createdAt: o.date ?? new Date(),
          },
          update: {
            // Só atualiza campos em branco para não sobrescrever dados do Shopify
            phone: { set: o.telefone || undefined },
            city: { set: o.cidade || undefined },
            state: { set: o.estado || undefined },
            zipCode: { set: o.cep || undefined },
          },
        });
        custOk++;
      } catch {
        custSkip++;
      }
    }));
    process.stdout.write(`\r  ${custOk + custSkip}/${paidOrders.length}`);
  }
  console.log(`\n  ✓ ${custOk} clientes | ✗ ${custSkip} ignorados\n`);

  // ── Busca mapa email → customerId ─────────────────────────────────────────

  const emails = [...new Set(paidOrders.map(o => o.email).filter(Boolean))];
  const dbCustomers = await db.customer.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const customerMap = new Map(dbCustomers.map(c => [c.email, c.id]));

  // ── Importa pedidos ───────────────────────────────────────────────────────

  console.log("🛍️  Importando pedidos...");
  let ordOk = 0, ordSkip = 0;

  for (const o of paidOrders) {
    try {
      const customerId = customerMap.get(o.email);
      if (!customerId) { ordSkip++; continue; }

      const shopifyId = `nuvem_${o.nuvemdId}`;
      const financialStatus = mapPaymentStatus(o.statusPagamento);
      const fulfillmentStatus = mapFulfillmentStatus(o.statusEnvio);

      const order = await db.order.upsert({
        where: { shopifyId },
        create: {
          shopifyId,
          orderNumber: o.orderNumDisplay,
          customerId,
          email: o.email,
          totalPrice: o.total,
          subtotalPrice: o.subtotal,
          totalDiscounts: o.desconto,
          totalTax: 0,
          currency: "BRL",
          financialStatus,
          fulfillmentStatus,
          shippingCity: o.cidade || null,
          shippingState: o.estado || null,
          shippingCountry: "Brazil",
          shippingZip: o.cep || null,
          discountCodes: o.cupom ? [{ code: o.cupom }] : [],
          note: [o.notaComprador, o.notaVendedor].filter(Boolean).join(" | ") || null,
          processedAt: o.dataPagamento ?? o.date,
          cancelledAt: o.cancelledAt,
          createdAt: o.date ?? new Date(),
        },
        update: {
          financialStatus,
          fulfillmentStatus,
          cancelledAt: o.cancelledAt,
          updatedAt: new Date(),
        },
      });

      // Line items
      if (o.lineItems.length > 0) {
        await db.lineItem.deleteMany({ where: { orderId: order.id } });
        await db.lineItem.createMany({
          data: o.lineItems.map((item) => ({
            orderId: order.id,
            shopifyItemId: `nuvem_${o.nuvemdId}_${item.idx}`,
            title: item.title,
            sku: item.sku || null,
            quantity: item.quantity,
            price: item.price,
            totalDiscount: 0,
          })),
        });
      }

      ordOk++;
    } catch {
      ordSkip++;
    }
    if ((ordOk + ordSkip) % 100 === 0) {
      process.stdout.write(`\r  ${ordOk + ordSkip}/${paidOrders.length}`);
    }
  }
  console.log(`\n  ✓ ${ordOk} pedidos | ✗ ${ordSkip} ignorados\n`);

  // ── Atualiza stats dos clientes ───────────────────────────────────────────

  console.log("📊 Atualizando estatísticas...");
  const affectedEmails = [...new Set(paidOrders.map(o => o.email).filter(Boolean))];
  const affectedCustomers = await db.customer.findMany({
    where: { email: { in: affectedEmails } },
    select: { id: true },
  });

  let statsDone = 0;
  for (let i = 0; i < affectedCustomers.length; i += 100) {
    const batch = affectedCustomers.slice(i, i + 100);
    await Promise.all(batch.map(async (c) => {
      const orders = await db.order.findMany({
        where: { customerId: c.id, financialStatus: "PAID" },
        select: { totalPrice: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      if (!orders.length) return;
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
      statsDone++;
    }));
    process.stdout.write(`\r  ${statsDone}/${affectedCustomers.length}`);
  }
  console.log(`\n  ✓ ${statsDone} clientes atualizados\n`);

  // ── RFM ───────────────────────────────────────────────────────────────────

  try {
    console.log("🧮 Recalculando RFM...");
    const { recalculateAllRFM } = await import("../src/services/rfm.service.js");
    await recalculateAllRFM();
    console.log("  ✓ RFM recalculado\n");
  } catch (e) {
    console.log("  ⚠️  RFM skipped:", e instanceof Error ? e.message : e, "\n");
  }

  console.log(`🎉 Importação Nuvem Shop concluída!`);
  console.log(`   ${ordOk} pedidos importados de ${paidOrders.length} pagos (${allOrders.length} total)\n`);
}

main()
  .catch(e => { console.error("❌ Erro:", e); process.exit(1); })
  .finally(() => db.$disconnect());
