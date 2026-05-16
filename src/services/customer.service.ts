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

  const insights = await generateCustomerInsights(customer);

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
