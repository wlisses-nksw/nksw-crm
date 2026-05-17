import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Normaliza telefone para formato Voll: apenas DDD + número (11 dígitos sem 55)
function toVollPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(2);
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

  const apiKey    = process.env.VOLL_API_KEY!;
  const baseUrl   = process.env.VOLL_BASE_URL!;
  const campaignId = process.env.VOLL_CAMPAIGN_ID!;
  const hsmId     = process.env.VOLL_HSM_ID!;

  // TODO: ajustar autenticação/parâmetros após confirmação do suporte Voll
  // Estrutura atual baseada no Gerador de endpoint — api_key no body JSON
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      campaign_id: campaignId,
      media_hsm_configuration_id: hsmId,
      enterprise_id: phone,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[voll send] ${res.status}: ${errText}`);
    return NextResponse.json(
      { error: `Voll retornou ${res.status}. Verifique as configurações da API.` },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: true, data });
}
