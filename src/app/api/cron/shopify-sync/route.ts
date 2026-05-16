import { NextRequest, NextResponse } from "next/server";
import { syncShopify } from "@/services/sync.service";

// Vercel injeta CRON_SECRET automaticamente e envia no header Authorization
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  console.log("[cron] Iniciando sync incremental Shopify...");

  const result = await syncShopify({ incrementalHours: 25 });

  console.log("[cron] Sync concluído:", result.message);
  return NextResponse.json(result);
}
