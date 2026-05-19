"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Download, Search, Package } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Tipos                                                               */
/* ------------------------------------------------------------------ */

interface ConfItem {
  variante:    string;
  codigo:      string;
  descricao:   string;
  cor:         string;
  tamanho:     string;
  curva:       string;
  sisplan:     number;
  pre_estoque: number;
  shopify:     number | null;
  diff:        number | null;
  // campos string para filtrar colunas numéricas (igual ao BI)
  sisplan_str: string;
  pre_str:     string;
  shopify_str: string;
  diff_str:    string;
}

// { campo: Set<string> }  →  Set vazio ou ausente = sem filtro (mostra tudo)
type FilterMap = Record<string, Set<string>>;

/* ------------------------------------------------------------------ */
/*  Colunas filtráveis – mesma ordem da tabela do BI                   */
/* ------------------------------------------------------------------ */

const FILTER_COLS: { key: string; label: string }[] = [
  { key: "codigo",      label: "Cód."        },
  { key: "descricao",   label: "Descrição"   },
  { key: "cor",         label: "Cor"         },
  { key: "tamanho",     label: "Tam."        },
  { key: "curva",       label: "Curva"       },
  { key: "sisplan_str", label: "Est. SIG 1"  },
  { key: "pre_str",     label: "Pré Estoque" },
  { key: "shopify_str", label: "Est. Shopify"},
  { key: "diff_str",    label: "Diferença"   },
];

/* ------------------------------------------------------------------ */
/*  Componente de filtro por coluna — recriado a cada load (key prop)  */
/* ------------------------------------------------------------------ */

function ColFilter({
  label,
  field,
  options,
  selected,
  onToggle,
  onAll,
  onNone,
}: {
  label:    string;
  field:    string;
  options:  string[];
  selected: Set<string>;
  onToggle: (field: string, val: string) => void;
  onAll:    (field: string) => void;
  onNone:   (field: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora (igual ao BI)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Checkbox marcado se: sem filtro (selected vazio) OU valor está no Set
  const isChecked = (opt: string) => selected.size === 0 || selected.has(opt);

  // Conta quantos items estão desmarcados (= filtrados fora)
  const hiddenCount = selected.size === 0
    ? 0
    : options.filter(o => !selected.has(o)).length;

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <button
        onClick={() => setOpen(v => !v)}
        className={`text-[13px] leading-none transition-colors ${
          hiddenCount > 0 ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
        title={hiddenCount > 0 ? `${hiddenCount} valor(es) ocultado(s)` : "Filtrar"}
      >
        ▾
      </button>
      {hiddenCount > 0 && (
        <span className="bg-primary text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold leading-none">
          {options.length - hiddenCount}/{options.length}
        </span>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-lg shadow-lg min-w-[160px] max-h-[260px] flex flex-col text-xs"
             style={{ minWidth: field === "descricao" ? 220 : field === "codigo" ? 180 : 140 }}>
          {/* Todos / Nenhum */}
          <div className="flex gap-2 px-3 py-2 border-b border-border">
            <button
              onClick={() => { onAll(field); }}
              className="flex-1 text-[10px] px-2 py-0.5 border border-border rounded bg-muted hover:border-primary hover:text-primary font-medium"
            >
              Todos
            </button>
            <button
              onClick={() => { onNone(field); }}
              className="flex-1 text-[10px] px-2 py-0.5 border border-border rounded bg-muted hover:border-primary hover:text-primary"
            >
              Nenhum
            </button>
          </div>
          {/* Lista de checkboxes */}
          <div className="overflow-y-auto flex-1 py-1 px-3">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 py-[3px] cursor-pointer hover:text-foreground text-foreground/80 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={isChecked(opt)}
                  onChange={() => onToggle(field, opt)}
                  className="w-3 h-3 accent-primary"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Badge de curva – igual ao BI (_curvaBadge)                         */
/* ------------------------------------------------------------------ */
function CurvaBadge({ curva }: { curva: string }) {
  const base = "px-1.5 py-0.5 rounded text-[10px] font-bold";
  if (curva === "A") return <span className={`${base} bg-green-100 text-green-700`}>A</span>;
  if (curva === "B") return <span className={`${base} bg-blue-100 text-blue-700`}>B</span>;
  return <span className={`${base} bg-muted text-muted-foreground`}>{curva || "—"}</span>;
}

/* ------------------------------------------------------------------ */
/*  Página                                                              */
/* ------------------------------------------------------------------ */

export default function ProdutosPage() {
  const [data,    setData]    = useState<ConfItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");
  const [filters, setFilters] = useState<FilterMap>({});
  // loadKey força remount de todos os ColFilter (limpa estado interno) a cada load
  const [loadKey, setLoadKey] = useState(0);

  /* ---- Carregar dados ---- */
  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/produtos/conferencia");
      const json = await res.json();
      if (res.ok) {
        // Adiciona campos string para filtros de colunas numéricas (igual ao BI)
        const items: ConfItem[] = (json.data as Omit<ConfItem, "sisplan_str"|"pre_str"|"shopify_str"|"diff_str">[])
          .map(p => ({
            ...p,
            pre_estoque:  (p as unknown as Record<string,unknown>).preEstoque as number ?? 0,
            sisplan_str:  String(p.sisplan ?? 0),
            pre_str:      String((p as unknown as Record<string,unknown>).preEstoque ?? 0),
            shopify_str:  p.shopify !== null ? String(p.shopify) : "—",
            diff_str:     p.diff === null    ? "—"
                        : p.diff === 0       ? "0"
                        : p.diff > 0         ? "+" + p.diff
                        :                      String(p.diff),
          }));
        setData(items);
        setFilters({});       // limpa filtros
        setLoadKey(k => k+1); // remonta os ColFilter (estado interno zerado)
        setSearch("");
      } else {
        toast.error(json.error ?? "Erro ao carregar dados");
      }
    } catch { toast.error("Erro de conexão"); }
    setLoading(false);
  };

  /* ---- Opções únicas por coluna ---- */
  const colOpts = useMemo(() => {
    if (!data) return {} as Record<string, string[]>;
    const opts: Record<string, string[]> = {};
    for (const { key } of FILTER_COLS) {
      opts[key] = [...new Set(data.map(r => String((r as unknown as Record<string,unknown>)[key] ?? "—")))].sort();
    }
    return opts;
  }, [data]);

  /* ---- Dados filtrados (lógica idêntica ao BI _confFiltered) ---- */
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter(row => {
      // filtro de texto por descrição, código ou cor (com null-safety)
      if (q) {
        const desc = (row.descricao || "").toLowerCase();
        const cod  = (row.codigo    || "").toLowerCase();
        const cor  = (row.cor       || "").toLowerCase();
        if (!desc.includes(q) && !cod.includes(q) && !cor.includes(q)) return false;
      }
      // filtros de coluna: se Set não vazio → só mostra se valor estiver no Set
      for (const [campo, s] of Object.entries(filters)) {
        if (!s || !s.size) continue;
        const val = String((row as unknown as Record<string,unknown>)[campo] ?? "—");
        if (!s.has(val)) return false;
      }
      return true;
    });
  }, [data, search, filters]);

  /* ---- Resumo sobre os itens filtrados (atualiza com busca e filtros) ---- */
  const resumo = useMemo(() => {
    const src = filtered;
    return {
      total:    src.length,
      iguais:   src.filter(r => r.diff === 0).length,
      sigMaior: src.filter(r => r.diff !== null && r.diff > 0).length,
      sigMenor: src.filter(r => r.diff !== null && r.diff < 0).length,
      semMatch: src.filter(r => r.shopify === null).length,
    };
  }, [filtered]);

  /* ---- CSV (igual ao BI downloadConferenciaCSV) ---- */
  const downloadCSV = useCallback(() => {
    if (!filtered.length) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Variante,Código,Descrição,Cor,Tamanho,Curva,Est. SIG 1,Pré Estoque,Est. Shopify,Diferença";
    const rows = filtered.map(p =>
      [esc(p.variante), esc(p.codigo), esc(p.descricao), esc(p.cor), esc(p.tamanho), esc(p.curva),
       p.sisplan, p.pre_estoque, p.shopify ?? "", p.diff ?? ""].join(",")
    );
    const csv = "﻿" + header + "\n" + rows.join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = "conferencia-estoque.csv";
    a.click();
  }, [filtered]);

  /* ---- Callbacks de filtro ---- */

  // Toggle: mesma lógica do BI (checkbox checked/unchecked)
  const handleToggle = useCallback((field: string, val: string) => {
    setFilters(prev => {
      const opts = colOpts[field] ?? [];
      const cur  = prev[field] ?? new Set<string>();
      const next = new Set(cur);

      if (cur.size === 0) {
        // Sem filtro ativo → usuário está desmarcando → mostra todos EXCETO este
        opts.forEach(o => next.add(o));
        next.delete(val);
      } else if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
        // Se todos selecionados → equivale a sem filtro
        if (next.size === opts.length) next.clear();
      }
      return { ...prev, [field]: next };
    });
  }, [colOpts]);

  // Todos → limpa filtro do campo (Set vazio = mostra tudo)
  const handleAll = useCallback((field: string) => {
    setFilters(prev => ({ ...prev, [field]: new Set<string>() }));
  }, []);

  // Nenhum → Set vazio também (igual ao BI: sem itens checked = nenhum filtro ativo, mas visualmente "nenhum marcado")
  // Na prática o BI exibe tudo quando nenhum está checked; mantemos consistência
  const handleNone = useCallback((field: string) => {
    setFilters(prev => ({ ...prev, [field]: new Set<string>() }));
  }, []);

  const hasFilter = Object.values(filters).some(s => s.size > 0);

  /* ---- Cor da diferença ---- */
  const diffStyle = (diff: number | null) => {
    if (diff === null) return "text-muted-foreground";
    if (diff === 0)    return "text-green-600 font-bold";
    if (diff > 0)      return "text-yellow-600 font-bold";
    return "text-red-600 font-bold";
  };

  /* ================================================================ */
  return (
    <div className="flex flex-col min-h-full">
      <Header title="Conferência de Estoque" />
      <div className="flex-1 p-6 space-y-4">

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Carregando..." : data ? "Atualizar" : "Carregar dados"}
          </Button>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.length} SKUs carregados
            </span>
          )}
          {data && (
            <div className="ml-auto flex items-center gap-3">
              {/* Busca por descrição */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por descrição do produto..."
                  className="pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary w-72"
                />
              </div>
              {hasFilter && (
                <button
                  onClick={() => setFilters({})}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Limpar filtros
                </button>
              )}
              <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-2">
                <Download className="w-3.5 h-3.5" />
                Baixar CSV
              </Button>
            </div>
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
            {/* Resumo (sobre total, não filtrado — igual ao BI) */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Total SKUs",     sub: "",                          value: resumo.total,    color: "#374151" },
                { label: "Iguais",         sub: "Sisplan = Shopify",         value: resumo.iguais,   color: "#16a34a" },
                { label: "Sisplan Maior",  sub: "Sisplan > Shopify",         value: resumo.sigMaior, color: "#ca8a04" },
                { label: "Sisplan Menor",  sub: "Sisplan < Shopify",         value: resumo.sigMenor, color: "#dc2626" },
                { label: "Sem match",      sub: "Variante não encontrada",   value: resumo.semMatch, color: "#9ca3af" },
              ].map(k => (
                <div key={k.label} className="bg-white border border-border rounded-xl p-4 text-center shadow-sm">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{k.label}</div>
                  {k.sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{k.sub}</div>}
                  <div className="text-3xl font-bold mt-2 leading-none" style={{ color: k.color, fontFamily: "serif" }}>
                    {k.value.toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabela com filtros nos cabeçalhos */}
            <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto" style={{ maxHeight: "600px", overflowY: "auto" }}>
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-20 bg-gray-50">
                    <tr>
                      {FILTER_COLS.map(({ key, label }) => (
                        <th
                          key={key}
                          className={`px-3 py-2.5 border-b border-border text-left whitespace-nowrap ${
                            ["sisplan_str","pre_str","shopify_str","diff_str"].includes(key) ? "text-center" : ""
                          }`}
                          style={{ position: "relative" }}
                        >
                          <ColFilter
                            key={`${key}-${loadKey}`}   /* remonta a cada load */
                            label={label}
                            field={key}
                            options={colOpts[key] ?? []}
                            selected={filters[key] ?? new Set()}
                            onToggle={handleToggle}
                            onAll={handleAll}
                            onNone={handleNone}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-muted-foreground">
                          Nenhum item encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    ) : filtered.map((row, i) => {
                      const diffStr = row.diff === null ? "—"
                                    : row.diff === 0    ? "0"
                                    : row.diff > 0      ? "+" + row.diff
                                    :                     String(row.diff);
                      return (
                        <tr
                          key={row.variante}
                          className={`hover:bg-accent/30 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                        >
                          <td className="px-3 py-2 font-mono text-muted-foreground text-[11px]">{row.codigo || "—"}</td>
                          <td className="px-3 py-2 font-medium max-w-[200px] truncate" title={row.descricao}>{row.descricao || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.cor || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-center font-medium">{row.tamanho || "—"}</td>
                          <td className="px-3 py-2 text-center"><CurvaBadge curva={row.curva} /></td>
                          <td className="px-3 py-2 text-center font-semibold">{row.sisplan}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{row.pre_estoque || 0}</td>
                          <td className="px-3 py-2 text-center">
                            {row.shopify !== null ? row.shopify : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-center ${diffStyle(row.diff)}`}>{diffStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex items-center gap-2">
                <span>
                  {filtered.length.toLocaleString("pt-BR")} itens
                  {filtered.length !== data.length ? ` de ${data.length.toLocaleString("pt-BR")} total` : ""}
                </span>
                {hasFilter && (
                  <button onClick={() => setFilters({})} className="text-primary hover:underline">
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
