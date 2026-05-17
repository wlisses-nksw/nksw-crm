/**
 * Registra (ou atualiza) os webhooks necessários no Shopify.
 * Rodar uma vez: npm run shopify:webhooks
 *
 * Webhooks registrados:
 *  - checkouts/create  → carrinhos abandonados
 *  - checkouts/update  → atualização do carrinho
 *  - orders/create     → marca carrinho como recuperado
 *  - orders/paid       → sync pedidos pagos
 *  - customers/update  → sync dados do cliente
 */

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

const DOMAIN  = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN!;
const API_V   = process.env.SHOPIFY_API_VERSION ?? "2024-01";
const BASE    = `https://${DOMAIN}/admin/api/${API_V}`;
const HEADERS = { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" };

// URL base do CRM no Vercel — ajuste se mudar o domínio
const CRM_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nksw-crm.vercel.app";
const WEBHOOK_ENDPOINT = `${CRM_URL}/api/webhooks/shopify`;

const TOPICS = [
  "checkouts/create",
  "checkouts/update",
  "orders/create",
  "orders/paid",
  "customers/update",
];

interface ShopifyWebhook {
  id: number;
  topic: string;
  address: string;
  format: string;
}

async function listWebhooks(): Promise<ShopifyWebhook[]> {
  const res = await fetch(`${BASE}/webhooks.json`, { headers: HEADERS });
  const data = await res.json() as { webhooks: ShopifyWebhook[] };
  return data.webhooks ?? [];
}

async function createWebhook(topic: string): Promise<void> {
  const res = await fetch(`${BASE}/webhooks.json`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      webhook: { topic, address: WEBHOOK_ENDPOINT, format: "json" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao criar ${topic}: ${err}`);
  }
}

async function updateWebhook(id: number, topic: string): Promise<void> {
  const res = await fetch(`${BASE}/webhooks/${id}.json`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({
      webhook: { id, address: WEBHOOK_ENDPOINT },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro ao atualizar ${topic}: ${err}`);
  }
}

async function main() {
  console.log(`\n🔗 Registrando webhooks Shopify → ${WEBHOOK_ENDPOINT}\n`);

  const existing = await listWebhooks();
  console.log(`  ${existing.length} webhooks já cadastrados\n`);

  for (const topic of TOPICS) {
    const found = existing.find(w => w.topic === topic);

    if (found) {
      if (found.address === WEBHOOK_ENDPOINT) {
        console.log(`  ✓  ${topic} (já correto)`);
      } else {
        await updateWebhook(found.id, topic);
        console.log(`  ↻  ${topic} (URL atualizada)`);
      }
    } else {
      await createWebhook(topic);
      console.log(`  +  ${topic} (criado)`);
    }
  }

  console.log("\n🎉 Webhooks configurados! O Shopify vai notificar o CRM em tempo real.");
  console.log(`\n⚠️  Se ainda não configurou, adicione em .env.local:`);
  console.log(`   SHOPIFY_WEBHOOK_SECRET=<secret gerado pelo Shopify>`);
  console.log(`   NEXT_PUBLIC_APP_URL=${CRM_URL}\n`);
}

main().catch(e => { console.error("❌ Erro:", e); process.exit(1); });
