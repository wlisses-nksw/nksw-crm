import OpenAI from "openai";
import type { CustomerWithRelations, RFMScore, CustomerInsight, ProductRecommendation } from "@/types";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================
// Análise de cliente
// ============================================================

export async function generateCustomerInsights(
  customer: CustomerWithRelations
): Promise<CustomerInsight[]> {
  const context = buildCustomerContext(customer);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Você é um analista de CRM especializado em e-commerce de moda premium (beachwear).
Analise os dados do cliente e gere insights acionáveis para os personal shoppers da Naked Swimwear.
Retorne um JSON com a chave "insights" contendo um array de objetos com: type, title, description, confidence (0-1).
Types disponíveis: opportunity, risk, action, info.
Seja conciso e direto. Foque em ações práticas que aumentem vendas e retenção.`,
      },
      {
        role: "user",
        content: `Analise este cliente:\n\n${context}`,
      },
    ],
  });

  const content = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(content) as { insights: CustomerInsight[] };
  return parsed.insights ?? [];
}

// ============================================================
// Recomendações de produtos
// ============================================================

export async function generateProductRecommendations(
  customer: CustomerWithRelations,
  availableProducts: { shopifyId: string; title: string; price: number; tags: string[] }[]
): Promise<ProductRecommendation[]> {
  const context = buildCustomerContext(customer);
  const productsContext = availableProducts
    .slice(0, 30)
    .map((p) => `${p.shopifyId}: ${p.title} (R$${p.price}) [${p.tags.join(", ")}]`)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Você é um personal shopper especializado em beachwear premium.
Com base no histórico do cliente, recomende os produtos mais relevantes.
Retorne JSON com chave "recommendations": array de { shopifyId, reason, score (0-1) }.
Máximo 5 recomendações. Priorize produtos que o cliente ainda não comprou.`,
      },
      {
        role: "user",
        content: `CLIENTE:\n${context}\n\nPRODUTOS DISPONÍVEIS:\n${productsContext}`,
      },
    ],
  });

  const content = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(content) as {
    recommendations: { shopifyId: string; reason: string; score: number }[];
  };

  return (parsed.recommendations ?? []).map((r) => {
    const product = availableProducts.find((p) => p.shopifyId === r.shopifyId);
    return {
      shopifyId: r.shopifyId,
      title: product?.title ?? "",
      price: product?.price ?? 0,
      reason: r.reason,
      score: r.score,
    };
  });
}

// ============================================================
// Distribuição inteligente de leads
// ============================================================

export async function rankLeadForShopper(
  customer: CustomerWithRelations,
  shoppers: { id: string; name: string; activeCustomers: number; recentConversions: number }[]
): Promise<{ shopperId: string; reason: string; confidence: number }> {
  const context = buildCustomerContext(customer);
  const shoppersContext = shoppers
    .map(
      (s) =>
        `ID: ${s.id}, Nome: ${s.name}, Clientes ativos: ${s.activeCustomers}, Conversões recentes: ${s.recentConversions}`
    )
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Você distribui leads para personal shoppers de forma inteligente.
Considere carga de trabalho atual, taxa de conversão recente e compatibilidade com o perfil do cliente.
Retorne JSON: { shopperId, reason, confidence (0-1) }`,
      },
      {
        role: "user",
        content: `CLIENTE:\n${context}\n\nPERSONAL SHOPPERS:\n${shoppersContext}`,
      },
    ],
  });

  const content = response.choices[0].message.content ?? "{}";
  return JSON.parse(content) as { shopperId: string; reason: string; confidence: number };
}

// ============================================================
// Sugestão de mensagem personalizada
// ============================================================

export async function generateOutreachMessage(
  customer: CustomerWithRelations,
  channel: "whatsapp" | "email",
  objective: "reengagement" | "upsell" | "abandoned_cart" | "follow_up"
): Promise<string> {
  const context = buildCustomerContext(customer);

  const objectiveMap = {
    reengagement: "reengajar cliente inativo",
    upsell: "apresentar nova coleção / produto complementar",
    abandoned_cart: "recuperar carrinho abandonado",
    follow_up: "follow-up pós compra",
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: `Você é personal shopper da Naked Swimwear, marca premium de beachwear brasileiro.
Tom: próximo, elegante, sem ser invasivo. Use o nome da cliente.
Canal: ${channel}. Objetivo: ${objectiveMap[objective]}.
Seja autêntica, curta (máx 3 parágrafos para email, 2 para WhatsApp).
NÃO use emojis em excesso. NÃO seja genérica.`,
      },
      {
        role: "user",
        content: `Escreva uma mensagem personalizada para:\n${context}`,
      },
    ],
  });

  return response.choices[0].message.content ?? "";
}

// ============================================================
// Helper: contexto do cliente para o modelo
// ============================================================

function buildCustomerContext(customer: CustomerWithRelations): string {
  const orders = customer.orders ?? [];
  const topProducts = orders
    .flatMap((o) => [])
    .slice(0, 5)
    .join(", ");

  return `
Nome: ${customer.firstName} ${customer.lastName}
Email: ${customer.email}
Cidade: ${customer.city ?? "—"}, ${customer.state ?? "—"}
Segmento: ${customer.segment}
Score RFM: ${customer.rfmScore ?? "—"} (${customer.rfmLabel ?? "—"})
Score engajamento: ${customer.engagementScore ?? "—"}/100
Total gasto: R$${customer.totalSpent?.toString() ?? "0"}
Número de pedidos: ${customer.ordersCount ?? 0}
Última compra: ${customer.lastOrderAt ? customer.lastOrderAt.toLocaleDateString("pt-BR") : "—"}
Primeira compra: ${customer.firstOrderAt ? customer.firstOrderAt.toLocaleDateString("pt-BR") : "—"}
Tags: ${customer.shopifyTags.join(", ") || "—"}
Marketing aceito: ${customer.acceptsMarketing ? "Sim" : "Não"}
${orders.length > 0 ? `Histórico de compras: ${orders.length} pedidos` : ""}
`.trim();
}
