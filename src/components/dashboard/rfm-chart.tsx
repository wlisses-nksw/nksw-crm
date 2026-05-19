"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface RFMChartProps {
  distribution: Record<string, number>;
}

// Segmentos personalizados do clientes.json (já em português)
const RFM_COLORS: Record<string, string> = {
  // VIP
  "VIP Ativo": "#ec4899",
  "VIP Reaquecer": "#f59e0b",
  "VIP Em Risco": "#dc2626",
  // Alto Valor
  "Alto Valor Ativo": "#f43f5e",
  "Alto Valor Em Risco": "#ef4444",
  "Alto Valor Hibernado": "#374151",
  "Alto Valor Morno": "#f97316",
  // Potencial
  "Potencial Ativo": "#3b82f6",
  "Potencial Morno": "#6366f1",
  "Potencial Inativo": "#9ca3af",
  // Outros
  Emergente: "#8b5cf6",
  "Novo/Eventual": "#a78bfa",
  "Baixo Engajamento": "#6b7280",
};

// Paleta de fallback para segmentos não mapeados
const FALLBACK_PALETTE = [
  "#f43f5e","#ec4899","#8b5cf6","#6366f1","#3b82f6",
  "#f59e0b","#f97316","#ef4444","#dc2626","#6b7280","#374151",
];

function getColor(label: string, index: number): string {
  return RFM_COLORS[label] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

export function RFMChart({ distribution }: RFMChartProps) {
  const data = Object.entries(distribution)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold">Distribuição RFM</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{total.toLocaleString("pt-BR")} clientes classificados</p>
        </div>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: 12,
              }}
              formatter={(value: number) => [value.toLocaleString("pt-BR"), "Clientes"]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={entry.label}
                  fill={getColor(entry.label, i)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda compacta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4">
        {data.slice(0, 8).map((d, i) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getColor(d.label, i) }}
            />
            <span className="text-xs text-muted-foreground">
              {d.label} <span className="font-medium text-foreground">({d.count.toLocaleString("pt-BR")})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
