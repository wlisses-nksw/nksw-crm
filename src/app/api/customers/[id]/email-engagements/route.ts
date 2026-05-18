import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  // 1. Tenta dados reais por-contato (webhooks Omnisend Pro)
  const engagements = await db.emailEngagement.findMany({
    where: { customerId: id },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  if (engagements.length > 0) {
    return NextResponse.json({ data: engagements, source: "webhook" });
  }

  // 2. Fallback: campanhas enviadas para a base (stats agregados)
  const campaigns = await db.omnisendCampaign.findMany({
    where: { status: "sent" },
    orderBy: { startDate: "desc" },
    take: 20,
  });

  // Formata no mesmo shape do EmailEngagement para o UI reutilizar
  const data = campaigns.map(c => ({
    id: c.id,
    campaignName: c.name,
    subject: c.subject,
    sentAt: c.startDate?.toISOString() ?? null,
    openedAt: null,   // sem dado por-contato ainda
    clickedAt: null,
    bouncedAt: null,
    openCount: 0,
    clickCount: 0,
    // campos extras para exibir stats agregados
    _aggregate: {
      sent: c.sent,
      openRate: c.sent > 0 ? Math.round((c.opened  / c.sent) * 100) : 0,
      clickRate: c.sent > 0 ? Math.round((c.clicked / c.sent) * 100) : 0,
    },
  }));

  return NextResponse.json({ data, source: "aggregate" });
}
