import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uploadFromUrl } from "@/lib/supabase";

// Normaliza telefone para comparação: remove tudo exceto dígitos, remove DDI 55 se tiver 13 dígitos
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

interface VollMessage {
  content: string;
  direction: "in" | "out";
  message_type: string;
  date: string;
  agent_name: string;
  sent: string | null;
  read: string | null;
  file_url?: string;
}

interface VollEndedSession {
  id: string;
  started_at: string;
  ended_at: string;
  protocol: string;
  system: string;
  agent: { id: string; name: string; login: string } | null;
  customer: { id: string; name: string };
  tabulation: { id: string; name: string; type: string } | null;
  messages: VollMessage[];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // ended_session vem direto no body; ack_send também
  const eventType = body.tabulation !== undefined ? "ended_session" : "ack_send";

  if (eventType !== "ended_session") {
    return NextResponse.json({ ok: true }); // ignora ack por enquanto
  }

  const payload = body as unknown as VollEndedSession;

  const customerPhone = payload.customer?.id;
  if (!customerPhone) return NextResponse.json({ ok: true });

  // Busca cliente no CRM pelo telefone (normalizado)
  const normalized = normalizePhone(customerPhone);
  const allCandidates = await db.customer.findMany({
    where: {
      phone: { not: null },
      deletedAt: null,
    },
    select: { id: true, phone: true },
    take: 5000,
  });

  const match = allCandidates.find(c => normalizePhone(c.phone ?? "") === normalized);
  if (!match) {
    console.log(`[voll] cliente não encontrado para telefone ${customerPhone}`);
    return NextResponse.json({ ok: true });
  }

  const msgCount = payload.messages?.length ?? 0;
  const humanMessages = payload.messages?.filter(m => m.message_type === "text") ?? [];
  const lastMsg = humanMessages.at(-1);

  // Faz upload permanente das imagens no Supabase Storage
  const messages = await Promise.all(
    (payload.messages ?? []).map(async (m, idx) => {
      if (m.message_type === "image" && m.file_url) {
        const ext = "jpg";
        const path = `voll/${payload.id}/${idx}.${ext}`;
        const permanentUrl = await uploadFromUrl(m.file_url, path);
        return permanentUrl ? { ...m, file_url: permanentUrl } : m;
      }
      return m;
    })
  );

  const snippet = [
    payload.tabulation?.name ?? "Encerrado",
    payload.agent?.name ? `Atendente: ${payload.agent.name}` : null,
    `${msgCount} mensagens`,
  ].filter(Boolean).join(" · ");

  await db.conversation.create({
    data: {
      customerId: match.id,
      channel: "WHATSAPP",
      direction: "INBOUND",
      subject: `Protocolo ${payload.protocol}`,
      body: JSON.stringify(messages),
      snippet,
      gmailThreadId: payload.id,
      createdAt: new Date(payload.started_at),
      updatedAt: new Date(payload.ended_at),
    },
  });

  console.log(`[voll] sessão salva para ${match.id} — protocolo ${payload.protocol}`);
  return NextResponse.json({ ok: true });
}
