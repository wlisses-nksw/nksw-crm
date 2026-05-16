import type {
  User,
  Customer,
  Order,
  LineItem,
  Task,
  Note,
  PipelineCard,
  PipelineStage,
  Pipeline,
  AiRecommendation,
  CustomerScore,
  Conversation,
  WhatsappMessage,
  AbandonedCart,
} from "@prisma/client";

export type OrderWithLineItems = Order & { lineItems?: LineItem[] };

export type { UserRole, CustomerSegment, TaskStatus, TaskType, TaskPriority } from "@prisma/client";

// ============================================================
// User
// ============================================================
export type SafeUser = Omit<User, "passwordHash">;

// ============================================================
// Customer com relacionamentos
// ============================================================
export type CustomerWithRelations = Customer & {
  orders?: OrderWithLineItems[];
  tasks?: Task[];
  notes?: Note[];
  assignedShopper?: Pick<User, "id" | "name" | "email" | "image" | "role"> | null;
  scores?: CustomerScore[];
  aiRecommendations?: AiRecommendation[];
  abandonedCarts?: AbandonedCart[];
  _count?: {
    orders: number;
    tasks: number;
    conversations: number;
  };
};

export type CustomerSummary = Pick<
  Customer,
  | "id"
  | "email"
  | "firstName"
  | "lastName"
  | "phone"
  | "segment"
  | "rfmScore"
  | "rfmLabel"
  | "totalSpent"
  | "ordersCount"
  | "lastOrderAt"
  | "shopifyId"
  | "assignedShopperId"
  | "engagementScore"
  | "city"
  | "state"
  | "createdAt"
>;

// ============================================================
// Pipeline
// ============================================================
export type PipelineWithStages = Pipeline & {
  stages: (PipelineStage & {
    cards: (PipelineCard & {
      customer: CustomerSummary;
    })[];
    _count: { cards: number };
  })[];
};

export type KanbanColumn = PipelineStage & {
  cards: (PipelineCard & {
    customer: CustomerSummary;
  })[];
};

// ============================================================
// RFM
// ============================================================
export interface RFMScore {
  recency: number;
  frequency: number;
  monetary: number;
  total: number;
  label: RFMLabel;
  segment: string;
}

export type RFMLabel =
  | "Champions"
  | "Loyal Customers"
  | "Potential Loyalists"
  | "Recent Customers"
  | "Promising"
  | "Needs Attention"
  | "About To Sleep"
  | "At Risk"
  | "Cannot Lose Them"
  | "Hibernating"
  | "Lost";

// ============================================================
// AI
// ============================================================
export interface CustomerInsight {
  type: "opportunity" | "risk" | "action" | "info";
  title: string;
  description: string;
  confidence: number;
  data?: Record<string, unknown>;
}

export interface ProductRecommendation {
  shopifyId: string;
  title: string;
  imageUrl?: string;
  price: number;
  reason: string;
  score: number;
}

// ============================================================
// Shopify
// ============================================================
export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  tags: string;
  accepts_marketing: boolean;
  email_marketing_consent: { state: string } | null;
  created_at: string;
  updated_at: string;
  last_order_id: number | null;
  addresses: ShopifyAddress[];
}

export interface ShopifyAddress {
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  address1: string | null;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string | null;
  customer: { id: number } | null;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  currency: string;
  discount_codes: { code: string; amount: string }[];
  line_items: ShopifyLineItem[];
  shipping_address: ShopifyAddress | null;
  tags: string;
  note: string | null;
  processed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface ShopifyLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  price: string;
  total_discount: string;
  image?: { src: string } | null;
}

export interface ShopifyCheckout {
  id: number;
  email: string | null;
  customer_id: number | null;
  total_price: string;
  currency: string;
  checkout_url: string;
  line_items: ShopifyLineItem[];
  abandoned_checkout_url: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// API Responses
// ============================================================
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  errors: number;
  message: string;
  duration: number;
}

// ============================================================
// Dashboard
// ============================================================
export interface DashboardStats {
  totalCustomers: number;
  newCustomersThisMonth: number;
  activeCustomers: number;
  vipCustomers: number;
  totalRevenue: number;
  averageOrderValue: number;
  abandonedCartsCount: number;
  abandonedCartsValue: number;
  openTasks: number;
  conversionRate: number;
  rfmDistribution: Record<string, number>;
  topPersonalShoppers: {
    user: SafeUser;
    conversions: number;
    revenue: number;
  }[];
}
