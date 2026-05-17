/**
 * Registra webhooks de email do Omnisend apontando para o CRM.
 * Rodar: npx tsx scripts/register-omnisend-webhook.ts
 *
 * Precisa de OMNISEND_API_KEY no .env.local
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

const API_KEY = process.env.OMNISEND_API_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://nksw-crm.vercel.app";
const ENDPOINT = `${APP_URL}/api/webhooks/omnisend`;

const EVENTS = ["email.sent", "email.opened", "email.clicked", "email.bounced"];

async function listWebhooks() {
  const res = await fetch("https://api.omnisend.com/v3/webhooks", {
    headers: { "X-API-KEY": API_KEY },
  });
  const data = await res.json() as { webhooks?: Array<{ webhookID: string; url: string; events: string[] }> };
  return data.webhooks ?? [];
}

async function createWebhook(event: string) {
  const res = await fetch("https://api.omnisend.com/v3/webhooks", {
    method: "POST",
    headers: { "X-API-KEY": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ url: ENDPOINT, events: [event] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  if (!API_KEY) {
    console.error("❌ OMNISEND_API_KEY não definida no .env.local");
    process.exit(1);
  }

  console.log(`\n📧 Registrando webhooks Omnisend → ${ENDPOINT}\n`);

  const existing = await listWebhooks();
  console.log(`  ${existing.length} webhooks existentes`);

  for (const event of EVENTS) {
    const already = existing.find(w => w.url === ENDPOINT && w.events.includes(event));
    if (already) {
      console.log(`  ✓ ${event} — já registrado (${already.webhookID})`);
      continue;
    }
    try {
      const created = await createWebhook(event);
      console.log(`  ✅ ${event} — criado (${created.webhookID ?? "?"})`);
    } catch (e) {
      console.error(`  ❌ ${event} — erro: ${e}`);
    }
  }

  console.log("\n🎉 Concluído.");
}

main().catch(e => { console.error("❌", e); process.exit(1); });
