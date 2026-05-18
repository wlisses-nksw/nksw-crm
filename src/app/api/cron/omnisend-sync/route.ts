import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const API_KEY  = process.env.OMNISEND_API_KEY!;
const BASE_URL = "https://api.omnisend.com/v3";

interface OmnisendCampaign {
  campaignID: string;
  name: string;
  subject?: string;
  status: string;
  type: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

async function fetchAllCampaigns(): Promise<OmnisendCampaign[]> {
  const all: OmnisendCampaign[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = new URL(`${BASE_URL}/campaigns`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": API_KEY },
    });
    if (!res.ok) break;

    const data = await res.json() as { campaign?: OmnisendCampaign[] };
    const campaigns = data.campaign ?? [];
    all.push(...campaigns);

    if (campaigns.length < limit) break;
    offset += limit;
  }

  return all;
}

export async function GET(req: NextRequest) {
  // Aceita cron (CRON_SECRET) ou usuário autenticado
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const session = isCron ? true : await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const campaigns = await fetchAllCampaigns();
    let upserted = 0;

    for (const c of campaigns) {
      await db.omnisendCampaign.upsert({
        where: { campaignID: c.campaignID },
        create: {
          campaignID: c.campaignID,
          name: c.name,
          subject: c.subject ?? null,
          status: c.status,
          type: c.type,
          sent: c.sent ?? 0,
          opened: c.opened ?? 0,
          clicked: c.clicked ?? 0,
          bounced: c.bounced ?? 0,
          unsubscribed: c.unsubscribed ?? 0,
          complained: c.complained ?? 0,
          startDate: c.startDate ? new Date(c.startDate) : null,
          endDate: c.endDate ? new Date(c.endDate) : null,
          syncedAt: new Date(),
        },
        update: {
          name: c.name,
          subject: c.subject ?? null,
          status: c.status,
          sent: c.sent ?? 0,
          opened: c.opened ?? 0,
          clicked: c.clicked ?? 0,
          bounced: c.bounced ?? 0,
          unsubscribed: c.unsubscribed ?? 0,
          complained: c.complained ?? 0,
          startDate: c.startDate ? new Date(c.startDate) : null,
          endDate: c.endDate ? new Date(c.endDate) : null,
          syncedAt: new Date(),
        },
      });
      upserted++;
    }

    return NextResponse.json({ ok: true, synced: upserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
