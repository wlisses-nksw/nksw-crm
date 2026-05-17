import { db } from "@/lib/db";
import type { CustomerWithRelations, CustomerSummary, PaginatedResponse } from "@/types";
import type { CustomerSegment, Prisma } from "@prisma/client";
import { generateCustomerInsights, generateProductRecommendations } from "@/lib/claude";
import { recalculateCustomerRFM } from "@/services/rfm.service";

// ============================================================
// Listagem com filtros e paginação
// ============================================================

export interface CustomerFilter {
  search?: string;
  segment?: CustomerSegment;
  assignedShopperId?: string;
  hasAbandonedCart?: boolean;
  minSpent?: number;
  page?: number;
  pageSize?: number;
  orderBy?: "name" | "totalSpent" | "lastOrderAt" | "rfmScore" | "createdAt";
  orderDir?: "asc" | "desc";
}

export async function listCustomers(
  filter: CustomerFilter = {}
): Promise<PaginatedResponse<CustomerSummary>> {
  const {
    search,
    segment,
    assignedShopperId,
    minSpent,
    page = 1,
    pageSize = 30,
    orderBy = "lastOrderAt",
    orderDir = "desc",
  } = filter;

  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    active: true,
    ...(search && {
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    }),
    ...(segment && { segment }),
    ...(assignedShopperId && { assignedShopperId }),
    ...(minSpent && { totalSpent: { gte: minSpent } }),
  };

  const orderByMap: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
    name: { firstName: orderDir },
    totalSpent: { totalSpent: orderDir },
    lastOrderAt: { lastOrderAt: orderDir },
    rfmScore: { rfmScore: orderDir },
    createdAt: { createdAt: orderDir },
  };

  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        segment: true,
        rfmScore: true,
        rfmLabel: true,
        totalSpent: true,
        ordersCount: true,
        lastOrderAt: true,
        shopifyId: true,
        assignedShopperId: true,
        engagementScore: true,
        city: true,
        state: true,
        createdAt: true,
      },
      orderBy: orderByMap[orderBy] ?? { lastOrderAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: customers as CustomerSummary[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ============================================================
// Perfil completo
// ============================================================

export async function getCustomerProfile(id: string): Promise<CustomerWithRelations | null> {
  return db.customer.findUnique({
    where: { id, deletedAt: null },
    include: {
      orders: {
        include: { lineItems: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      tasks: {
        where: { status: { not: "CANCELADA" } },
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: { dueAt: "asc" },
        take: 10,
      },
      notes: {
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      assignedShopper: {
        select: { id: true, name: true, email: true, image: true, role: true },
      },
      scores: {
        orderBy: { calculatedAt: "desc" },
        take: 5,
      },
      aiRecommendations: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { score: "desc" },
        take: 5,
      },
      abandonedCarts: {
        orderBy: { abandonedAt: "desc" },
        take: 3,
      },
      _count: {
        select: { orders: true, tasks: true, conversations: true },
      },
    },
  });
}

// ============================================================
// Atribuir personal shopper
// ============================================================

export async function assignShopper(
  customerId: string,
  shopperId: string,
  assignedBy: string
): Promise<void> {
  await db.customer.update({
    where: { id: customerId },
    data: { assignedShopperId: shopperId },
  });

  await db.auditLog.create({
    data: {
      userId: assignedBy,
      action: "ASSIGN_SHOPPER",
      resource: "customer",
      resourceId: customerId,
      newData: { shopperId },
    },
  });
}

// ============================================================
// Refresh de insights IA
// ============================================================

export async function refreshCustomerInsights(customerId: string): Promise<void> {
  const customer = await getCustomerProfile(customerId);
  if (!customer) return;

  await recalculateCustomerRFM(customerId);

  // Produtos que o cliente já comprou (para excluir das recomendações)
  const customerProductTitles = new Set(
    (customer.orders ?? []).flatMap(o => (o.lineItems ?? []).map(i => i.title.split(" - ")[0].trim()))
  );

  // Carrega perfil de segmento pré-computado (atualizado mensalmente via segment:update)
  const segmentProfile = await db.segmentProfile.findUnique({
    where: { segment: customer.segment },
  });

  let segmentTopProducts: string[] = [];
  let segmentContext: { summary?: string; sequences?: { after: string; buyNext: string[] }[] } = {};

  if (segmentProfile) {
    segmentTopProducts = (segmentProfile.topProducts as string[])
      .filter(p => !customerProductTitles.has(p))
      .slice(0, 10);

    // Sequências relevantes: apenas as que envolvem produtos que o cliente já comprou
    const allSequences = segmentProfile.nextBuyProducts as { after: string; buyNext: string[] }[];
    const relevantSequences = allSequences
      .filter(s => customerProductTitles.has(s.after))
      .map(s => ({ after: s.after, buyNext: s.buyNext.filter(p => !customerProductTitles.has(p)) }))
      .filter(s => s.buyNext.length > 0)
      .slice(0, 5);

    segmentContext = { summary: segmentProfile.summary, sequences: relevantSequences };
  } else {
    // Fallback: consulta live se perfil não existe ainda
    const raw = await db.$queryRaw<Array<{ title: string }>>`
      SELECT split_part(li.title, ' - ', 1) AS title
      FROM line_items li
      JOIN orders o    ON o.id = li."orderId"
      JOIN customers c ON c.id = o."customerId"
      WHERE c.segment = ${customer.segment}::"CustomerSegment"
        AND o."financialStatus" = 'PAID'
      GROUP BY split_part(li.title, ' - ', 1)
      ORDER BY SUM(li.quantity) DESC
      LIMIT 20
    `;
    segmentTopProducts = raw.map(p => p.title.trim()).filter(t => t && !customerProductTitles.has(t)).slice(0, 10);
  }

  const insights = await generateCustomerInsights(customer, segmentTopProducts, segmentContext);

  // Salva como recomendações do tipo "insight"
  await db.aiRecommendation.deleteMany({
    where: { customerId, type: "insight" },
  });

  await db.aiRecommendation.createMany({
    data: insights.map((i) => ({
      customerId,
      type: "insight",
      title: i.title,
      reason: i.description,
      score: i.confidence,
      metadata: i as object,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    })),
  });
}

// ============================================================
// Adicionar nota
// ============================================================

export async function addNote(
  customerId: string,
  content: string,
  userId: string
): Promise<void> {
  await db.note.create({
    data: { customerId, content, userId },
  });
}

// ============================================================
// Adicionar tag
// ============================================================

export async function addTag(customerId: string, tag: string): Promise<void> {
  await db.customerTag.upsert({
    where: { customerId_tag: { customerId, tag: tag.toLowerCase() } },
    create: { customerId, tag: tag.toLowerCase() },
    update: {},
  });
}

export async function removeTag(customerId: string, tag: string): Promise<void> {
  await db.customerTag.deleteMany({
    where: { customerId, tag: tag.toLowerCase() },
  });
}

// ============================================================
// Busca global
// ============================================================

export async function globalSearch(query: string, limit = 10): Promise<CustomerSummary[]> {
  if (!query || query.length < 2) return [];

  return db.customer.findMany({
    where: {
      deletedAt: null,
      active: true,
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      segment: true,
      rfmScore: true,
      rfmLabel: true,
      totalSpent: true,
      ordersCount: true,
      lastOrderAt: true,
      shopifyId: true,
      assignedShopperId: true,
      engagementScore: true,
      city: true,
      state: true,
      createdAt: true,
    },
    take: limit,
    orderBy: { totalSpent: "desc" },
  }) as Promise<CustomerSummary[]>;
}
