import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCampaignById, DEFAULT_CAMPAIGN } from "@/lib/voll";

// Normaliza telefone para formato Voll: 55 + DDD + número (13 dígitos com DDI)
function toVollPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Já tem 55 na frente
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 12 && digits.startsWith("55")) return digits;
  // Tem só DDD + número (10 ou 11 dígitos) — adiciona 55
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { id } = await params;

    // Lê o slug da campanha do body (opcional — usa padrão se não informado)
    const body = await req.json().catch(() => ({}));
    const campaignSlug: string = body.campaignSlug ?? DEFAULT_CAMPAIGN.id;

    const campaign = getCampaignById(campaignSlug);
    if (!campaign) {
      return NextResponse.json({ error: `Campanha '${campaignSlug}' não encontrada` }, { status: 400 });
    }

    const customer = await db.customer.findUnique({
      where: { id },
      select: { id: true, firstName: true, phone: true },
    });

    if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    if (!customer.phone) return NextResponse.json({ error: "Cliente sem telefone cadastrado" }, { status: 400 });

    const phone = toVollPhone(customer.phone);

    const apiKey     = process.env.VOLL_API_KEY;
    const baseUrl    = process.env.VOLL_BASE_URL;
    const campaignId = process.env.VOLL_CAMPAIGN_ID;

    // Validação explícita de env vars
    if (!apiKey)     return NextResponse.json({ error: "Config: VOLL_API_KEY não definida" }, { status: 500 });
    if (!baseUrl)    return NextResponse.json({ error: "Config: VOLL_BASE_URL não definida" }, { status: 500 });
    if (!campaignId) return NextResponse.json({ error: "Config: VOLL_CAMPAIGN_ID não definida" }, { status: 500 });

    // URLSearchParams codifica colchetes como %5B%5D — a Voll exige colchetes literais
    // em contact[phone], então montamos a query string manualmente para esse param.
    const qs = new URLSearchParams({
      api_key: apiKey,
      campaign_id: campaignId,
      media_hsm_configuration_id: campaign.hsmId,
    });
    const vollUrl = `${baseUrl}?${qs.toString()}&contact[phone]=${phone}`;

    console.log(`[voll send] campanha=${campaign.id} phone=${phone} — ${vollUrl.replace(apiKey, "***")}`);

    const res = await fetch(vollUrl, { method: "POST" });
    const resText = await res.text().catch(() => "");

    console.log(`[voll send] status=${res.status} body=${resText}`);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Voll retornou ${res.status}: ${resText}` },
        { status: 502 }
      );
    }

    const data = (() => { try { return JSON.parse(resText); } catch { return { raw: resText }; } })();

    // Registra o disparo no histórico do cliente
    await db.whatsappMessage.create({
      data: {
        customerId: customer.id,
        direction: "OUTBOUND",
        from: "nakedsw",
        to: phone,
        body: `HSM disparado — campanha: ${campaign.name} (${campaign.id})`,
        status: "SENT",
        sentAt: new Date(),
      },
    }).catch(() => {}); // não bloqueia se falhar o log

    return NextResponse.json({
      ok: true,
      phone,
      campaign: campaign.id,
      hsmId: campaign.hsmId,
      data,
      debug_url: vollUrl.replace(apiKey, "***"),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[voll send] exceção:", msg);
    return NextResponse.json({ error: `Erro interno: ${msg}` }, { status: 500 });
  }
}
