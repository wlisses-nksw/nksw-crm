import { NextRequest, NextResponse } from "next/server";
import { recalculateAllRFM } from "@/services/rfm.service";

/**
 * Cron semanal (domingos 4h UTC = 1h Brasil) para recalcular RFM de todos os clientes.
 * O cron diário do shopify-sync atualiza apenas os clientes que tiveram atividade no dia.
 * Este cron garante que o score de TODOS os clientes se mantém atualizado (ex: Recency degrada com o tempo).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  console.log("[cron/rfm-update] Iniciando recálculo completo de RFM...");
  const start = Date.now();

  try {
    const updated = await recalculateAllRFM();
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[cron/rfm-update] ${updated} clientes atualizados em ${duration}s`);
    return NextResponse.json({ ok: true, updated, duration: parseFloat(duration) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[cron/rfm-update] Erro:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
