import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHmac } from "crypto";

function verifyOmnisend(rawBody: string, signature: string): boolean {
  const secret = process.env.OMNISEND_WEBHOOK_SECRET;
  if (!secret) return true; // skip em dev se não configurado
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

interface OmnisendPayload {
  eventID?: string;
  event: string;
  createdAt?: string;
  contact?: { contactID?: string; email?: string };
  campaign?: { campaignID?: string; name?: string; subject?: string };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-omnisend-signature") ?? "";

  if (!verifyOmnisend(rawBody, signature)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let payload: OmnisendPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = payload.contact?.email?.toLowerCase().trim();
  if (!email) return NextResponse.json({ ok: true }); // ignora sem email

  const event = payload.event ?? "";
  const now = payload.createdAt ? new Date(payload.createdAt) : new Date();

  // Só processa eventos de email
  const emailEvents = ["email.sent", "email.opened", "email.clicked", "email.bounced"];
  if (!emailEvents.includes(event)) return NextResponse.json({ ok: true });

  const customer = await db.customer.findFirst({
    where: { email },
    select: { id: true },
  });
  if (!customer) return NextResponse.json({ ok: true }); // contato sem cadastro no CRM

  const campaignId = payload.campaign?.campaignID ?? null;
  const campaignName = payload.campaign?.name ?? null;
  const subject = payload.campaign?.subject ?? null;

  // Upsert por email + campaignId (se existir) — consolida eventos da mesma campanha
  const where = campaignId
    ? { customerId_campaignId: { customerId: customer.id, campaignId } }
    : undefined;

  if (where) {
    await db.emailEngagement.upsert({
      where,
      create: {
        customerId: customer.id,
        email,
        campaignId,
        campaignName,
        subject,
        sentAt:    event === "email.sent"    ? now : null,
        openedAt:  event === "email.opened"  ? now : null,
        clickedAt: event === "email.clicked" ? now : null,
        bouncedAt: event === "email.bounced" ? now : null,
        openCount:  event === "email.opened"  ? 1 : 0,
        clickCount: event === "email.clicked" ? 1 : 0,
      },
      update: {
        ...(event === "email.sent"    && { sentAt: now }),
        ...(event === "email.opened"  && { openedAt: now, openCount: { increment: 1 } }),
        ...(event === "email.clicked" && { clickedAt: now, clickCount: { increment: 1 } }),
        ...(event === "email.bounced" && { bouncedAt: now }),
        ...(campaignName && { campaignName }),
        ...(subject && { subject }),
      },
    });
  } else {
    // Sem campaignId — cria registro simples
    await db.emailEngagement.create({
      data: {
        customerId: customer.id,
        email,
        campaignId,
        campaignName,
        subject,
        sentAt:    event === "email.sent"    ? now : null,
        openedAt:  event === "email.opened"  ? now : null,
        clickedAt: event === "email.clicked" ? now : null,
        bouncedAt: event === "email.bounced" ? now : null,
        openCount:  event === "email.opened"  ? 1 : 0,
        clickCount: event === "email.clicked" ? 1 : 0,
      },
    });
  }

  console.log(`[omnisend] ${event} → ${email}`);
  return NextResponse.json({ ok: true });
}
