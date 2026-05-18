import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const campaigns = await db.omnisendCampaign.findMany({
    orderBy: { startDate: "desc" },
    take: 20,
  });

  // Calcula taxas
  const withRates = campaigns.map(c => ({
    ...c,
    openRate:  c.sent > 0 ? Math.round((c.opened  / c.sent) * 100) : 0,
    clickRate: c.sent > 0 ? Math.round((c.clicked / c.sent) * 100) : 0,
    bounceRate: c.sent > 0 ? Math.round((c.bounced / c.sent) * 100) : 0,
  }));

  return NextResponse.json({ data: withRates });
}
