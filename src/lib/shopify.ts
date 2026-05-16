import axios from "axios";
import type {
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyCheckout,
  ShopifyLineItem,
} from "@/types";
import { withRetry } from "@/lib/utils";

const SHOPIFY_BASE = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION}`;

const shopifyClient = axios.create({
  baseURL: SHOPIFY_BASE,
  headers: {
    "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN!,
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

// Rate limit: Shopify permite 2 req/s no plano básico (40 burst)
async function shopifyGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  return withRetry(async () => {
    const { data } = await shopifyClient.get<T>(path, { params });
    return data;
  });
}

// ============================================================
// Clientes
// ============================================================

export async function fetchAllCustomers(updatedSinceMin?: string): Promise<ShopifyCustomer[]> {
  const customers: ShopifyCustomer[] = [];
  let pageInfo: string | null = null;
  let isFirst = true;

  while (isFirst || pageInfo) {
    isFirst = false;
    const params: Record<string, string | number> = { limit: 250 };
    if (updatedSinceMin) params.updated_at_min = updatedSinceMin;
    if (pageInfo) params.page_info = pageInfo;

    const data = await shopifyGet<{ customers: ShopifyCustomer[] }>(
      "/customers.json",
      params
    );

    customers.push(...data.customers);

    // Cursor-based pagination via Link header — axios não expõe facilmente,
    // então paramos quando retornar menos que 250
    if (data.customers.length < 250) break;
  }

  return customers;
}

export async function fetchCustomer(shopifyId: string): Promise<ShopifyCustomer> {
  const data = await shopifyGet<{ customer: ShopifyCustomer }>(
    `/customers/${shopifyId}.json`
  );
  return data.customer;
}

export async function searchCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  const data = await shopifyGet<{ customers: ShopifyCustomer[] }>(
    "/customers/search.json",
    { query: `email:${email}`, limit: 1 }
  );
  return data.customers[0] ?? null;
}

export async function updateCustomerTags(
  shopifyId: string,
  tags: string
): Promise<ShopifyCustomer> {
  const { data } = await shopifyClient.put<{ customer: ShopifyCustomer }>(
    `/customers/${shopifyId}.json`,
    { customer: { tags } }
  );
  return data.customer;
}

// ============================================================
// Pedidos
// ============================================================

export async function fetchAllOrders(params?: {
  updatedSinceMin?: string;
  financialStatus?: string;
  limit?: number;
}): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];
  const requestParams: Record<string, string | number> = {
    limit: params?.limit ?? 250,
    status: "any",
  };

  if (params?.updatedSinceMin) requestParams.updated_at_min = params.updatedSinceMin;
  if (params?.financialStatus) requestParams.financial_status = params.financialStatus;

  const data = await shopifyGet<{ orders: ShopifyOrder[] }>("/orders.json", requestParams);
  orders.push(...data.orders);

  return orders;
}

export async function fetchOrdersByCustomer(customerId: string): Promise<ShopifyOrder[]> {
  const data = await shopifyGet<{ orders: ShopifyOrder[] }>("/orders.json", {
    customer_id: customerId,
    status: "any",
    limit: 250,
  });
  return data.orders;
}

// ============================================================
// Carrinhos Abandonados
// ============================================================

export async function fetchAbandonedCheckouts(limit = 250): Promise<ShopifyCheckout[]> {
  const data = await shopifyGet<{ checkouts: ShopifyCheckout[] }>(
    "/checkouts.json",
    { limit, status: "open" }
  );
  return data.checkouts;
}

// ============================================================
// Produtos
// ============================================================

export async function fetchProducts(limit = 250) {
  const data = await shopifyGet<{ products: unknown[] }>("/products.json", {
    limit,
    status: "active",
    fields: "id,title,vendor,product_type,tags,handle,images,variants",
  });
  return data.products;
}

// ============================================================
// Validação de webhook
// ============================================================

export async function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string
): Promise<boolean> {
  const { createHmac } = await import("crypto");
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET!;
  const hash = createHmac("sha256", secret).update(rawBody).digest("base64");
  return hash === hmacHeader;
}

// ============================================================
// Helpers
// ============================================================

export function normalizeShopifyCustomer(c: ShopifyCustomer) {
  const address = c.addresses?.[0];
  return {
    shopifyId: String(c.id),
    email: c.email.toLowerCase(),
    firstName: c.first_name || "",
    lastName: c.last_name || "",
    phone: c.phone,
    city: address?.city,
    state: address?.province,
    country: address?.country || "Brazil",
    zipCode: address?.zip,
    address: address?.address1,
    totalSpent: parseFloat(c.total_spent),
    ordersCount: c.orders_count,
    shopifyTags: c.tags ? c.tags.split(",").map((t) => t.trim()) : [],
    acceptsMarketing: c.accepts_marketing,
    createdAt: new Date(c.created_at),
  };
}

export function normalizeShopifyOrder(o: ShopifyOrder, customerId: string) {
  return {
    shopifyId: String(o.id),
    orderNumber: o.order_number,
    customerId,
    email: o.email,
    totalPrice: parseFloat(o.total_price),
    subtotalPrice: parseFloat(o.subtotal_price),
    totalDiscounts: parseFloat(o.total_discounts),
    totalTax: parseFloat(o.total_tax),
    currency: o.currency || "BRL",
    financialStatus: mapFinancialStatus(o.financial_status),
    fulfillmentStatus: o.fulfillment_status,
    shippingCity: o.shipping_address?.city,
    shippingState: o.shipping_address?.province,
    shippingCountry: o.shipping_address?.country,
    shippingZip: o.shipping_address?.zip,
    discountCodes: o.discount_codes as object,
    shopifyTags: o.tags ? o.tags.split(",").map((t) => t.trim()) : [],
    note: o.note,
    processedAt: o.processed_at ? new Date(o.processed_at) : null,
    cancelledAt: o.cancelled_at ? new Date(o.cancelled_at) : null,
    createdAt: new Date(o.created_at),
  };
}

function mapFinancialStatus(status: string) {
  const map: Record<string, string> = {
    pending: "PENDING",
    paid: "PAID",
    refunded: "REFUNDED",
    voided: "CANCELLED",
    partially_paid: "PENDING",
    partially_refunded: "PAID",
    authorized: "PENDING",
  };
  return (map[status] ?? "PENDING") as "PENDING" | "PAID" | "FULFILLED" | "REFUNDED" | "CANCELLED";
}
