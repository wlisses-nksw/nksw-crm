import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const customer = await db.customer.findUnique({
    where: { id },
    select: { id: true, firstName: true, phone: true },
  });

  if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!customer.phone) return NextResponse.json({ error: "Cliente sem telefone cadastrado" }, { status: 400 });

  const phone = toVollPhone(customer.phone);

  const apiKey     = process.env.VOLL_API_KEY!;
  const baseUrl    = process.env.VOLL_BASE_URL!;        // https://nakedsw.vollsc.com/api/send_hsm
  const campaignId = process.env.VOLL_CAMPAIGN_ID!;
  const hsmId      = process.env.VOLL_HSM_ID!;

  // Parâmetros vão na query string conforme documentação Voll
  const url = new URL(baseUrl);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("campaign_id", campaignId);
  url.searchParams.set("media_hsm_configuration_id", hsmId);
  url.searchParams.set("contact[phone]", phone);

  console.log(`[voll send] disparando para ${phone} — ${url.toString().replace(apiKey, "***")}`);

  const res = await fetch(url.toString(), { method: "POST" });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[voll send] ${res.status}: ${errText}`);
    return NextResponse.json(
      { error: `Voll retornou ${res.status}: ${errText}` },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({}));

  // Registra o disparo no histórico do cliente
  await db.whatsappMessage.create({
    data: {
      customerId: customer.id,
      direction: "OUTBOUND",
      from: "nakedsw",
      to: phone,
      body: `HSM disparado — campaign_id: ${campaignId}`,
      status: "SENT",
      sentAt: new Date(),
    },
  }).catch(() => {}); // não bloqueia se falhar o log

  return NextResponse.json({ ok: true, phone, data });
}
