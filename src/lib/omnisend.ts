import axios from "axios";

const omnisendClient = axios.create({
  baseURL: "https://api.omnisend.com/v3",
  headers: {
    "X-API-KEY": process.env.OMNISEND_API_KEY!,
    "Content-Type": "application/json",
  },
  timeout: 15_000,
});

export interface OmnisendContact {
  contactID: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  status: "subscribed" | "unsubscribed" | "nonSubscribed";
  tags?: string[];
  customFields?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface OmnisendCampaignStats {
  campaignID: string;
  name: string;
  subject?: string;
  sentAt?: string;
  stats: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
    openRate: number;
    clickRate: number;
  };
}

export interface OmnisendSegment {
  segmentID: string;
  name: string;
  count: number;
  createdAt: string;
}

// ============================================================
// Contatos
// ============================================================

export async function getContactByEmail(email: string): Promise<OmnisendContact | null> {
  try {
    const { data } = await omnisendClient.get("/contacts", {
      params: { email, limit: 1 },
    });
    return data.contacts?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getAllContacts(limit = 250, offset = 0): Promise<OmnisendContact[]> {
  const { data } = await omnisendClient.get("/contacts", {
    params: { limit, offset },
  });
  return data.contacts ?? [];
}

export async function upsertContact(contact: Partial<OmnisendContact> & { email: string }) {
  try {
    const existing = await getContactByEmail(contact.email);
    if (existing) {
      const { data } = await omnisendClient.patch(`/contacts/${existing.contactID}`, contact);
      return data;
    } else {
      const { data } = await omnisendClient.post("/contacts", contact);
      return data;
    }
  } catch (err) {
    console.error("[Omnisend] upsertContact error:", err);
    throw err;
  }
}

export async function unsubscribeContact(contactId: string) {
  const { data } = await omnisendClient.post(`/contacts/${contactId}/unsubscribe`);
  return data;
}

// ============================================================
// Campanhas
// ============================================================

export async function getCampaigns(limit = 10): Promise<OmnisendCampaignStats[]> {
  const { data } = await omnisendClient.get("/campaigns", {
    params: { limit, type: "email" },
  });

  const campaigns = data.campaigns ?? [];
  return campaigns.map((c: Record<string, unknown>) => ({
    campaignID: c.campaignID,
    name: c.name,
    subject: (c.options as Record<string, unknown>)?.subject,
    sentAt: c.startDate,
    stats: {
      sent: (c.statistics as Record<string, unknown>)?.sent ?? 0,
      opened: (c.statistics as Record<string, unknown>)?.opened ?? 0,
      clicked: (c.statistics as Record<string, unknown>)?.clicked ?? 0,
      bounced: (c.statistics as Record<string, unknown>)?.bounced ?? 0,
      unsubscribed: (c.statistics as Record<string, unknown>)?.unsubscribed ?? 0,
      openRate: (c.statistics as Record<string, unknown>)?.openRate ?? 0,
      clickRate: (c.statistics as Record<string, unknown>)?.clickRate ?? 0,
    },
  }));
}

// ============================================================
// Segmentos
// ============================================================

export async function getSegments(): Promise<OmnisendSegment[]> {
  const { data } = await omnisendClient.get("/segments");
  return data.segments ?? [];
}

// ============================================================
// Eventos customizados (disparo de automações)
// ============================================================

export async function fireEvent(
  email: string,
  eventName: string,
  fields?: Record<string, unknown>
) {
  const { data } = await omnisendClient.post("/events", {
    email,
    eventName,
    fields,
  });
  return data;
}

// ============================================================
// Score de engajamento (calculado localmente)
// ============================================================

export function calculateEngagementScore(contact: OmnisendContact | null): number {
  if (!contact) return 0;

  let score = 0;

  if (contact.status === "subscribed") score += 20;

  const customFields = contact.customFields ?? {};
  const openRate = (customFields.openRate as number) ?? 0;
  const clickRate = (customFields.clickRate as number) ?? 0;
  const ordersCount = (customFields.ordersCount as number) ?? 0;

  score += Math.min(openRate * 40, 40);
  score += Math.min(clickRate * 30, 30);
  score += Math.min(ordersCount * 2, 10);

  return Math.round(Math.min(score, 100));
}
