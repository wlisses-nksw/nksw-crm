"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, Filter, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { ScoreBadge } from "@/components/shared/score-badge";
import { formatCurrency, formatDate, formatRelative } from "@/lib/utils";
import type { CustomerSummary, PaginatedResponse } from "@/types";
import type { CustomerSegment } from "@prisma/client";

const SEGMENTS: { value: CustomerSegment | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "VIP", label: "VIP" },
  { value: "ALTO_POTENCIAL", label: "Alto Potencial" },
  { value: "RECORRENTE", label: "Recorrente" },
  { value: "EM_RISCO", label: "Em Risco" },
  { value: "INATIVO", label: "Inativo" },
  { value: "NOVO", label: "Novo" },
  { value: "PRIMEIRA_COMPRA", label: "1ª Compra" },
];

export function CustomerList() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<CustomerSegment | "">("");
  const [page, setPage] = useState(1);
  const [orderBy, setOrderBy] = useState<string>("lastOrderAt");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

  const queryKey = ["customers", search, segment, page, orderBy, orderDir];

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse<CustomerSummary>>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "30",
        orderBy,
        orderDir,
        ...(search && { search }),
        ...(segment && { segment }),
      });
      const res = await fetch(`/api/customers?${params}`);
      return res.json();
    },
  });

  function toggleSort(field: string) {
    if (orderBy === field) {
      setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(field);
      setOrderDir("desc");
    }
    setPage(1);
  }

  const customers = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {SEGMENTS.map((s) => (
            <button
              key={s.value}
              onClick={() => { setSegment(s.value as CustomerSegment | ""); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                segment === s.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contador */}
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString("pt-BR")} clientes
        {isFetching && !isLoading && " · Atualizando..."}
      </p>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Segmento
                </th>
                <SortHeader
                  label="Total Gasto"
                  field="totalSpent"
                  current={orderBy}
                  dir={orderDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Pedidos"
                  field="ordersCount"
                  current={orderBy}
                  dir={orderDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Última Compra"
                  field="lastOrderAt"
                  current={orderBy}
                  dir={orderDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Score RFM"
                  field="rfmScore"
                  current={orderBy}
                  dir={orderDir}
                  onSort={toggleSort}
                />
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Localização
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-4 py-3">
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </td>
                    </tr>
                  ))
                : customers.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-primary text-xs font-semibold">
                              {c.firstName?.charAt(0) ?? "?"}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                              {c.firstName} {c.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge segment={c.segment} />
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">
                        {formatCurrency(c.totalSpent)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {c.ordersCount ?? 0}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {c.lastOrderAt ? formatRelative(c.lastOrderAt) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {c.rfmScore ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 rounded-full bg-muted flex-1 max-w-16 overflow-hidden"
                            >
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.min((c.rfmScore / 555) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono">{c.rfmScore}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.city ? `${c.city}${c.state ? `, ${c.state}` : ""}` : "—"}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: string;
  current: string;
  dir: "asc" | "desc";
  onSort: (f: string) => void;
}) {
  const active = current === field;
  return (
    <th className="px-4 py-3 text-left">
      <button
        onClick={() => onSort(field)}
        className={`flex items-center gap-1 text-xs font-medium transition-colors ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </th>
  );
}
