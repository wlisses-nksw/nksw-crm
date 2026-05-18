"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { RefreshCw, Download, Search, Package, ChevronDown, X } from "lucide-react";
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

// Colunas filtráveis com seus labels e campo correspondente
const FILTER_COLS = [
  { key: "codigo",   label: "Cód." },
  { key: "descricao", label: "Descrição" },
  { key: "cor",      label: "Cor" },
  { key: "tamanho",  label: "Tam." },
  { key: "curva",    label: "Curva" },
] as const;

type FilterColKey = typeof FILTER_COLS[number]["key"];

// Componente de filtro por coluna (dropdown com checkboxes)
function ColFilter({
  label,
  field,
  options,
  selected,
  onToggle,
  onAll,
  onNone,
}: {
  label: string;
  field: string;
  options: string[];
  selected: Set<string>;
  onToggle: (field: string, val: string) => void;
  onAll: (field: string) => void;
  onNone: (field: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeCount = selected.size;
  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors ${
          activeCount > 0
            ? "text-primary bg-primary/10"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        {activeCount > 0 && (
          <span className="bg-primary text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg w-48 max-h-72 flex flex-col text-xs">
          {/* Busca dentro do filtro */}
          {options.length > 8 && (
            <div className="p-1.5 border-b border-border">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full px-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
          {/* Todos / Nenhum */}
          <div className="flex gap-1 px-2 py-1.5 border-b border-border">
            <button
              onClick={() => onAll(field)}
              className="flex-1 text-[10px] text-primary hover:underline font-medium"
            >
              Todos
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => onNone(field)}
              className="flex-1 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
            >
              Nenhum
            </button>
          </div>
          {/* Lista de opções */}
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-muted-foreground text-[10px]">Nenhum resultado</div>
            ) : filtered.map(opt => {
              const checked = selected.size === 0 || selected.has(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-1 hover:bg-accent cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(field, opt)}
                    className="w-3 h-3 accent-primary"
                  />
                  <span className="truncate flex-1">{opt || <span className="text-muted-foreground italic">vazio</span>}</span>
                </label>
              );
            })}
          </div>
          {/* Fechar */}
          <div className="px-2 py-1.5 border-t border-border">
            <button
              onClick={() => setOpen(false)}
              className="w-full text-[10px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
            >
              <X className="w-2.5 h-2.5" /> Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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

  // Opções únicas para filtros de coluna (sempre calculadas sobre data completo)
  const colOpts = useMemo(() => {
    if (!data) return {} as Record<string, string[]>;
    const opts: Record<string, string[]> = {};
    for (const { key } of FILTER_COLS) {
      opts[key] = [...new Set(data.map(r => String((r as unknown as Record<string, unknown>)[key] ?? "")))].sort();
    }
    return opts;
  }, [data]);

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
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = "conferencia-estoque.csv";
    a.click();
  };

  const toggleFilter = useCallback((field: string, val: string) => {
    setFilters(prev => {
      const next = { ...prev };
      // Se o campo ainda não tem seleção → todos estão "visíveis"
      // Ao clicar num item: selecionar APENAS esse (excluir os outros)
      if (!next[field] || next[field].size === 0) {
        // Desmarca todos exceto o clicado
        const all = colOpts[field] ?? [];
        const s = new Set(all);
        s.delete(val);
        next[field] = s;
      } else {
        const s = new Set(next[field]);
        if (s.has(val)) {
          s.delete(val);
        } else {
          s.add(val);
        }
        // Se todos marcados → equivale a nenhum filtro
        const all = colOpts[field] ?? [];
        if (s.size === all.length) {
          next[field] = new Set();
        } else {
          next[field] = s;
        }
      }
      return next;
    });
  }, [colOpts]);

  const setAll = useCallback((field: string) => {
    setFilters(prev => ({ ...prev, [field]: new Set() }));
  }, []);

  const setNone = useCallback((field: string) => {
    setFilters(prev => {
      const all = colOpts[field] ?? [];
      // "Nenhum" = todos marcados como excluídos → mostra nada
      // Implementamos como: mantém todos os valores no Set (= exclui tudo)
      return { ...prev, [field]: new Set(all) };
    });
  }, [colOpts]);

  const hasActiveFilters = Object.values(filters).some(s => s.size > 0);

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
        <div className="flex items-center gap-3 flex-wrap">
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
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters({})}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                  Limpar filtros
                </Button>
              )}
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

            {/* Tabela */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[62vh] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                    <tr>
                      {/* Colunas com filtro dropdown */}
                      {FILTER_COLS.map(({ key, label }) => (
                        <th key={key} className="px-3 py-2.5 text-left whitespace-nowrap border-b border-border">
                          <ColFilter
                            label={label}
                            field={key}
                            options={colOpts[key as FilterColKey] ?? []}
                            selected={filters[key] ?? new Set()}
                            onToggle={toggleFilter}
                            onAll={setAll}
                            onNone={setNone}
                          />
                        </th>
                      ))}
                      {/* Colunas numéricas sem filtro dropdown */}
                      {["SIG 1", "Pré Est.", "Shopify", "Dif."].map(h => (
                        <th key={h} className="px-3 py-2.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-10 text-muted-foreground">
                          Nenhum resultado encontrado.
                        </td>
                      </tr>
                    ) : filtered.map((row, i) => (
                      <tr key={row.variante} className={`hover:bg-accent/40 transition-colors ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{row.codigo}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate" title={row.descricao}>{row.descricao}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.cor}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{row.tamanho}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            row.curva === "A" ? "bg-green-100 text-green-700" :
                            row.curva === "B" ? "bg-blue-100 text-blue-700" :
                            "bg-muted text-muted-foreground"
                          }`}>{row.curva || "—"}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.sisplan}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.preEstoque}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.shopify !== null ? row.shopify : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${diffColor(row.diff)}`}>
                          {row.diff !== null
                            ? (row.diff > 0 ? `+${row.diff}` : row.diff)
                            : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex items-center gap-2">
                <span>
                  {filtered.length.toLocaleString("pt-BR")} itens
                  {filtered.length !== data.length ? ` de ${data.length.toLocaleString("pt-BR")}` : ""}
                </span>
                {hasActiveFilters && (
                  <button
                    onClick={() => setFilters({})}
                    className="text-primary hover:underline text-[10px]"
                  >
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
