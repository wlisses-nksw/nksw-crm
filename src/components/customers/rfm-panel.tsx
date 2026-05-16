"use client";

import { formatCurrency } from "@/lib/utils";

interface RFMSegment {
  segmento: string;
  base: number;
  pedidos: number;
  receita: number;
  racional: string;
  acao: string;
}

interface CohortRow {
  safra: string;
  clientes: number;
  receita: number;
  m: (number | null)[];
}

interface ClientesData {
  kpis: {
    total: number;
    recompras: number;
    pctRecomp: number;
    ltv: number;
    avgDaysBetween: number;
    totalReceita: number;
  };
  rfm: RFMSegment[];
  cohort: CohortRow[];
}

interface RFMPanelProps {
  data: ClientesData;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

function cohortColor(v: number | null) {
  if (v === null) return "bg-muted text-muted-foreground/40";
  if (v >= 20) return "bg-primary text-white";
  if (v >= 10) return "bg-primary/60 text-white";
  if (v >= 5)  return "bg-primary/30 text-primary";
  if (v > 0)   return "bg-primary/15 text-primary/80";
  return "bg-muted text-muted-foreground/40";
}

export function RFMPanel({ data }: RFMPanelProps) {
  const { kpis, rfm, cohort } = data;
  const maxCohortMonths = Math.max(...cohort.map(c => c.m.length));

  const kpiCards = [
    { label: "Base Total", value: fmt(kpis.total), sub: "clientes únicos" },
    { label: "Recompras", value: `${fmt(kpis.recompras)}`, sub: `${kpis.pctRecomp}% da base` },
    { label: "LTV Médio", value: formatCurrency(kpis.ltv) ?? "—", sub: "por cliente" },
    { label: "Ciclo Médio", value: `${kpis.avgDaysBetween}d`, sub: "entre compras" },
    { label: "Receita Total", value: formatCurrency(kpis.totalReceita) ?? "—", sub: "histórico" },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{k.label}</p>
            <p className="font-serif text-2xl font-bold text-foreground leading-none mb-1">{k.value}</p>
            <p className="text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Segmentos RFM */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-serif text-[15px] font-bold text-foreground">Segmentação RFM</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{rfm.length} segmentos ativos</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Segmento</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Base</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Pedidos</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Receita</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Ação recomendada</th>
              </tr>
            </thead>
            <tbody>
              {rfm.map((seg, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground">{seg.segmento}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(seg.base)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmt(seg.pedidos)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">{formatCurrency(seg.receita)}</td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground hidden lg:table-cell max-w-xs">{seg.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cohort */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-serif text-[15px] font-bold text-foreground">Análise de Cohort</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">% de clientes que recompraram por mês após a 1ª compra</p>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="text-left pr-4 pb-2 font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Safra</th>
                <th className="text-right pr-3 pb-2 font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Clientes</th>
                {Array.from({ length: maxCohortMonths }).map((_, i) => (
                  <th key={i} className="pb-2 font-bold text-muted-foreground uppercase tracking-wider px-1 text-center whitespace-nowrap">
                    M{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohort.map((row, i) => (
                <tr key={i}>
                  <td className="pr-4 py-1 font-semibold text-foreground whitespace-nowrap">{row.safra}</td>
                  <td className="pr-3 py-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmt(row.clientes)}</td>
                  {Array.from({ length: maxCohortMonths }).map((_, j) => {
                    const v = row.m[j] ?? null;
                    return (
                      <td key={j} className="py-1 px-0.5">
                        <span className={`inline-block px-1.5 py-1 rounded text-center min-w-[44px] font-bold ${cohortColor(v)}`}>
                          {v !== null ? `${v}%` : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
