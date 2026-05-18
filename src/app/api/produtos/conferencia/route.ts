import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwefXDeEKr09AOHxzjRP-Tm0AU222_qvHzw6ifDFrAwt_OE_TGsqo8FUTdjGrC2oeu7CA/exec";

const SHOPIFY_BASE = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION ?? "2024-01"}`;
const SHOPIFY_HEADERS = { "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN! };

// Busca inventário Shopify: variantId → qty
async function getShopifyInventory(): Promise<Record<string, number>> {
  const inventory: Record<string, number> = {};
  let url: string | null = `${SHOPIFY_BASE}/products.json?limit=250&fields=variants&status=active`;

  while (url) {
    const res = await fetch(url, { headers: SHOPIFY_HEADERS });
    if (!res.ok) throw new Error(`Shopify ${res.status}`);
    const data = await res.json() as { products: { variants: { id: number; inventory_quantity: number }[] }[] };

    for (const p of data.products ?? []) {
      for (const v of p.variants ?? []) {
        inventory[String(v.id)] = v.inventory_quantity ?? 0;
      }
    }

    const link = res.headers.get("link") ?? "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return inventory;
}

// Busca dados Sisplan do Google Apps Script
interface SisplanItem {
  variante: string;
  codigo: string;
  nome: string;
  cor: string;
  tamanho: string;
  curva: string;
  estoque: number;
  pre_estoque: number;
}

async function getSisplanData(): Promise<SisplanItem[]> {
  const res = await fetch(`${SHEETS_URL}?section=estoque`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Sheets ${res.status}`);
  const data = await res.json() as { ok: boolean; estoque?: { todos?: SisplanItem[] } };
  if (!data.ok) throw new Error("Sheets retornou erro");
  return (data.estoque?.todos ?? []).filter((p: SisplanItem) => p.variante);
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const [sisplan, shopifyInventory] = await Promise.all([
      getSisplanData(),
      getShopifyInventory(),
    ]);

    const data = sisplan.map(p => {
      const shopify = shopifyInventory[p.variante] ?? null;
      const sisTotal = (p.estoque ?? 0) + (p.pre_estoque ?? 0);
      const diff = shopify !== null ? sisTotal - shopify : null;

      return {
        variante:    p.variante,
        codigo:      p.codigo,
        descricao:   p.nome,
        cor:         p.cor,
        tamanho:     p.tamanho,
        curva:       p.curva,
        sisplan:     p.estoque ?? 0,
        preEstoque:  p.pre_estoque ?? 0,
        shopify,
        diff,
      };
    });

    return NextResponse.json({ ok: true, total: data.length, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[produtos/conferencia]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
