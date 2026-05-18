"use client";

import { useState, useMemo } from "react";
import { RefreshCw, Download, Search, Package } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ConfItem {
  variante:   string;
  codigo:     string;
  descricao:  string;
  cor:        string;
  tamanho:    string;
  curva:      string;
  sisplan:    number;
  preEstoque: number;
  shopify:    number | null;
  diff:       number | null;
}

type FilterMap = Record<string, Set<string>>;

export default function ProdutosPage() {
  const [data,    setData]    = useState<ConfItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [filters, setFilters] = useState<FilterMap>({});

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/produtos/conferencia");
      const json = await res.json();
      if (res.ok) { setData(json.data); setFilters({}); }
      else toast.error(json.error ?? "Erro ao carregar dados");
    } catch { toast.error("Erro de conexão"); }
    setLoading(false);
  };

  // Filtro por busca + filtros de coluna
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter(row => {
      if (q && !row.descricao.toLowerCase().includes(q) &&
               !row.codigo.toLowerCase().includes(q) &&
               !row.cor.toLowerCase().includes(q)) return false;
      for (const [field, vals] of Object.entries(filters)) {
        if (!vals.size) continue;
        const v = String((row as unknown as Record<string, unknown>)[field] ?? "");
        if (!vals.has(v)) return false;
      }
      return true;
    });
  }, [data, search, filters]);

  // Resumo
  const resumo = useMemo(() => {
    const total    = filtered.length;
    const iguais   = filtered.filter(r => r.diff === 0).length;
    const sigMaior = filtered.filter(r => r.diff !== null && r.diff > 0).length;
    const sigMenor = filtered.filter(r => r.diff !== null && r.diff < 0).length;
    const semMatch = filtered.filter(r => r.diff === null).length;
    return { total, iguais, sigMaior, sigMenor, semMatch };
  }, [filtered]);

  // CSV export
  const downloadCSV = () => {
    const header = "Variante,Código,Descrição,Cor,Tamanho,Curva,Est. SIG 1,Pré Estoque,Est. Shopify,Diferença";
    const rows = filtered.map(r =>
      [r.variante, r.codigo, r.descricao, r.cor, r.tamanho, r.curva,
       r.sisplan, r.preEstoque, r.shopify ?? "", r.diff ?? ""]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "conferencia-estoque.csv";
    a.click();
  };

  // Opções únicas para filtros de coluna
  const colOpts = useMemo(() => {
    if (!data) return {} as Record<string, string[]>;
    const cols = ["curva", "cor", "tamanho", "codigo"] as const;
    const opts: Record<string, string[]> = {};
    for (const col of cols) {
      opts[col] = [...new Set(data.map(r => String((r as unknown as Record<string, unknown>)[col] ?? "")))].sort();
    }
    return opts;
  }, [data]);

  const toggleFilter = (field: string, val: string) => {
    setFilters(prev => {
      const next = { ...prev };
      const s = new Set(next[field] ?? []);
      if (s.has(val)) s.delete(val); else s.add(val);
      next[field] = s;
      return next;
    });
  };

  const diffColor = (diff: number | null) => {
    if (diff === null) return "text-muted-foreground";
    if (diff === 0)    return "text-green-600 font-medium";
    if (diff > 0)      return "text-orange-500 font-medium";
    return "text-red-600 font-medium";
  };

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Conferência de Estoque" />
      <div className="flex-1 p-6 space-y-4">

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <Button onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Carregando..." : data ? "Atualizar" : "Carregar dados"}
          </Button>
          {data && (
            <>
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por produto, código, cor..."
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-2">
                <Download className="w-3.5 h-3.5" />
                CSV
              </Button>
            </>
          )}
        </div>

        {/* Estado vazio */}
        {!data && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Package className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Clique em "Carregar dados" para buscar o estoque do Sisplan e Shopify.</p>
          </div>
        )}

        {data && (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Total SKUs",     value: resumo.total,    color: "" },
                { label: "Iguais",         value: resumo.iguais,   color: "text-green-600" },
                { label: "SIG > Shopify",  value: resumo.sigMaior, color: "text-orange-500" },
                { label: "SIG < Shopify",  value: resumo.sigMenor, color: "text-red-600" },
                { label: "Sem match",      value: resumo.semMatch, color: "text-muted-foreground" },
              ].map(k => (
                <div key={k.label} className="bg-card border border-border rounded-xl p-3 text-center">
                  <div className="text-[10px] text-muted-foreground mb-1">{k.label}</div>
                  <div className={`text-xl font-bold ${k.color}`}>{k.value.toLocaleString("pt-BR")}</div>
                </div>
              ))}
            </div>

            {/* Filtros rápidos */}
            <div className="flex flex-wrap gap-4 text-xs">
              {(["curva", "tamanho"] as const).map(field => (
                <div key={field} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-medium uppercase tracking-wide">
                    {field === "curva" ? "Curva" : "Tam."}:
                  </span>
                  {colOpts[field]?.map(opt => {
                    const active = filters[field]?.has(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => toggleFilter(field, opt)}
                        className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                          active ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ))}
              {Object.values(filters).some(s => s.size > 0) && (
                <button onClick={() => setFilters({})} className="text-muted-foreground hover:text-foreground underline text-[11px]">
                  Limpar filtros
                </button>
              )}
            </div>

            {/* Tabela */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      {["Cód.", "Descrição", "Cor", "Tam.", "Curva", "SIG 1", "Pré Est.", "Shopify", "Dif."].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-10 text-muted-foreground">Nenhum resultado encontrado.</td>
                      </tr>
                    ) : filtered.map((row, i) => (
                      <tr key={row.variante} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{row.codigo}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate" title={row.descricao}>{row.descricao}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.cor}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{row.tamanho}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            row.curva === "A" ? "bg-green-100 text-green-700" :
                            row.curva === "B" ? "bg-blue-100 text-blue-700" :
                            "bg-muted text-muted-foreground"
                          }`}>{row.curva}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.sisplan}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.preEstoque}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.shopify !== null ? row.shopify : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${diffColor(row.diff)}`}>
                          {row.diff !== null ? (row.diff > 0 ? `+${row.diff}` : row.diff) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
                {filtered.length.toLocaleString("pt-BR")} itens{filtered.length !== data.length ? ` de ${data.length.toLocaleString("pt-BR")}` : ""}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
