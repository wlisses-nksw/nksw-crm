import Anthropic from "@anthropic-ai/sdk";
import type { CustomerWithRelations, CustomerInsight, ProductRecommendation } from "@/types";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================================
// Análise de cliente
// ============================================================

export async function generateCustomerInsights(
  customer: CustomerWithRelations,
  segmentTopProducts?: string[],
  segmentContext?: { summary?: string; sequences?: { after: string; buyNext: string[] }[] }
): Promise<CustomerInsight[]> {
  const context = buildCustomerContext(customer);

  let segmentBlock = "";
  if (segmentTopProducts && segmentTopProducts.length > 0) {
    segmentBlock += `\nPRODUTOS POPULARES NO SEGMENTO ${customer.segment} NÃO COMPRADOS POR ESTE CLIENTE:\n`;
    segmentBlock += segmentTopProducts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  }
  if (segmentContext?.sequences && segmentContext.sequences.length > 0) {
    segmentBlock += `\n\nSEQUÊNCIAS DE COMPRA DO SEGMENTO (clientes que compraram → costumam comprar depois):\n`;
    segmentBlock += segmentContext.sequences
      .map(s => `• Após "${s.after}" → ${s.buyNext.join(", ")}`)
      .join("\n");
  }
  if (segmentContext?.summary) {
    segmentBlock += `\n\nPERFIL DO SEGMENTO: ${segmentContext.summary}`;
  }

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `Você é um analista de CRM especializado em e-commerce de moda premium (beachwear) para a Naked Swimwear.
Gere 4-5 insights acionáveis para os personal shoppers, priorizando recomendações de produtos e oportunidades de venda.

REGRAS OBRIGATÓRIAS:
- Use APENAS os dados fornecidos. NUNCA invente datas, valores ou períodos.
- "Recência" no RFM indica quando foi a última compra: 5=últimos 30 dias, 4=31-60 dias, 3=61-120 dias, 2=121-180 dias, 1=mais de 180 dias.
- NÃO sugira reativação para clientes com Recência >= 3 (compraram nos últimos 120 dias).
- Foque em: quais produtos recomendar com base no histórico + comportamento do segmento, qual o melhor momento para contato, oportunidades de upsell/cross-sell específicas.
- Descreva os produtos pelo nome, não de forma genérica.

Retorne APENAS JSON válido: { "insights": [{ "type": "opportunity"|"risk"|"action"|"info", "title": string, "description": string, "confidence": 0-1 }] }`,
    messages: [
      {
        role: "user",
        content: `Analise este cliente e retorne apenas JSON:\n\n${context}${segmentBlock}`,
      },
    ],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const json = extractJSON(content);
    const parsed = JSON.parse(json) as { insights: CustomerInsight[] };
    return parsed.insights ?? [];
  } catch {
    return [];
  }
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

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `Você é um personal shopper especializado em beachwear premium.
Com base no histórico do cliente, recomende os produtos mais relevantes.
Retorne APENAS JSON com chave "recommendations": array de { shopifyId, reason, score (0-1) }.
Máximo 5 recomendações. Priorize produtos que o cliente ainda não comprou.`,
    messages: [
      {
        role: "user",
        content: `CLIENTE:\n${context}\n\nPRODUTOS DISPONÍVEIS:\n${productsContext}\n\nRetorne apenas JSON.`,
      },
    ],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const json = extractJSON(content);
    const parsed = JSON.parse(json) as {
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
  } catch {
    return [];
  }
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

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: `Você distribui leads para personal shoppers de forma inteligente.
Considere carga de trabalho atual, taxa de conversão recente e compatibilidade com o perfil do cliente.
Retorne APENAS JSON: { shopperId, reason, confidence (0-1) }`,
    messages: [
      {
        role: "user",
        content: `CLIENTE:\n${context}\n\nPERSONAL SHOPPERS:\n${shoppersContext}\n\nRetorne apenas JSON.`,
      },
    ],
  });

  const content = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const json = extractJSON(content);
    return JSON.parse(json) as { shopperId: string; reason: string; confidence: number };
  } catch {
    return { shopperId: shoppers[0]?.id ?? "", reason: "Distribuição padrão", confidence: 0.5 };
  }
}

// ============================================================
// Mensagem personalizada para personal shoppers
// ============================================================

export async function generateOutreachMessage(
  customer: CustomerWithRelations,
  channel: "whatsapp" | "email",
  objective: "reengagement" | "upsell" | "abandoned_cart" | "follow_up"
): Promise<string> {
  const context = buildCustomerContext(customer);

  const objectiveMap = {
    reengagement: "reengajar cliente inativa",
    upsell: "apresentar nova coleção / produto complementar",
    abandoned_cart: "recuperar carrinho abandonado",
    follow_up: "follow-up pós compra",
  };

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: `Você é personal shopper da Naked Swimwear, marca premium de beachwear brasileiro.
Tom: próximo, elegante, sem ser invasivo. Use o nome da cliente.
Canal: ${channel}. Objetivo: ${objectiveMap[objective]}.
Seja autêntica, curta (máx 3 parágrafos para email, 2 para WhatsApp).
NÃO use emojis em excesso. NÃO seja genérica. Escreva apenas a mensagem, sem explicações.`,
    messages: [
      {
        role: "user",
        content: `Escreva uma mensagem personalizada para:\n${context}`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ============================================================
// Helper: contexto do cliente
// ============================================================

function buildCustomerContext(customer: CustomerWithRelations): string {
  const orders = (customer.orders ?? [])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const now = new Date();
  const daysSinceLast = customer.lastOrderAt
    ? Math.floor((now.getTime() - new Date(customer.lastOrderAt).getTime()) / 86_400_000)
    : null;
  const daysSinceFirst = customer.firstOrderAt
    ? Math.floor((now.getTime() - new Date(customer.firstOrderAt).getTime()) / 86_400_000)
    : null;
  const avgDaysBetween = customer.ordersCount && customer.ordersCount > 1 && daysSinceFirst
    ? Math.floor(daysSinceFirst / (customer.ordersCount - 1))
    : null;

  const recentOrders = orders.slice(0, 8).map(o => {
    const date = new Date(o.createdAt).toLocaleDateString("pt-BR");
    const valor = `R$${Number(o.totalPrice).toFixed(2)}`;
    const items = (o.lineItems ?? []).map(i => i.title).join(", ") || "—";
    return `  • ${date} | ${valor} | ${items}`;
  }).join("\n");

  const topProducts = (() => {
    const count: Record<string, number> = {};
    for (const o of orders) {
      for (const item of (o.lineItems ?? [])) {
        const key = item.title.split(" - ")[0].trim();
        count[key] = (count[key] ?? 0) + (item.quantity ?? 1);
      }
    }
    return Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => `${name} (${qty}x)`)
      .join(", ");
  })();

  return `
PERFIL DO CLIENTE
Nome: ${customer.firstName} ${customer.lastName}
Email: ${customer.email}
Cidade: ${customer.city ?? "—"}, ${customer.state ?? "—"}
Cliente desde: ${customer.firstOrderAt ? new Date(customer.firstOrderAt).toLocaleDateString("pt-BR") : "—"}${daysSinceFirst ? ` (${Math.floor(daysSinceFirst / 30)} meses)` : ""}

COMPORTAMENTO DE COMPRA
Total gasto: R$${Number(customer.totalSpent ?? 0).toFixed(2)}
Número de pedidos: ${customer.ordersCount ?? 0}
Ticket médio: R$${Number(customer.averageOrderValue ?? 0).toFixed(2)}
Última compra: ${customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString("pt-BR") : "—"}${daysSinceLast !== null ? ` (há ${daysSinceLast} dias)` : ""}
Intervalo médio entre compras: ${avgDaysBetween ? `${avgDaysBetween} dias` : "—"}
Próxima compra esperada: ${avgDaysBetween && daysSinceLast !== null ? (daysSinceLast > avgDaysBetween ? "ATRASADA" : `em ~${avgDaysBetween - daysSinceLast} dias`) : "—"}

SCORE RFM
Segmento: ${customer.segment} (${customer.rfmLabel ?? "—"})
Recência: ${customer.rfmRecency ?? "—"}/5 | Frequência: ${customer.rfmFrequency ?? "—"}/5 | Monetário: ${customer.rfmMonetary ?? "—"}/5
Score total: ${customer.rfmScore ?? "—"}
Aceita marketing: ${customer.acceptsMarketing ? "Sim" : "Não"}

PRODUTOS MAIS COMPRADOS
${topProducts || "—"}

ÚLTIMOS PEDIDOS (mais recentes primeiro)
${recentOrders || "Nenhum pedido encontrado"}
`.trim();
}

// Extrai JSON de uma resposta que pode ter texto ao redor
function extractJSON(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}
