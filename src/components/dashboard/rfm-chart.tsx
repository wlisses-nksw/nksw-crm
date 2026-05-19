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

const RFM_COLORS: Record<string, string> = {
  Champions: "#f43f5e",
  "Loyal Customers": "#ec4899",
  "Potential Loyalists": "#8b5cf6",
  "Recent Customers": "#6366f1",
  Promising: "#3b82f6",
  "Needs Attention": "#f59e0b",
  "About To Sleep": "#f97316",
  "At Risk": "#ef4444",
  "Cannot Lose Them": "#dc2626",
  Hibernating: "#6b7280",
  Lost: "#374151",
};

const RFM_PT: Record<string, string> = {
  Champions: "Campeões",
  "Loyal Customers": "Clientes Fiéis",
  "Potential Loyalists": "Potenciais Fiéis",
  "Recent Customers": "Clientes Novos",
  Promising: "Promissores",
  "Needs Attention": "Precisam Atenção",
  "About To Sleep": "Quase Inativos",
  "At Risk": "Em Risco",
  "Cannot Lose Them": "Não Pode Perder",
  Hibernating: "Hibernando",
  Lost: "Perdidos",
};

export function RFMChart({ distribution }: RFMChartProps) {
  const data = Object.entries(distribution)
    .map(([label, count]) => ({ label, labelPt: RFM_PT[label] ?? label, count }))
    .sort((a, b) => b.count - a.count);

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold">Distribuição RFM</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{total} clientes classificados</p>
        </div>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="labelPt"
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
              formatter={(value: number) => [value, "Clientes"]}
              labelFormatter={(labelPt: string) => labelPt}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={RFM_COLORS[entry.label] ?? "hsl(var(--primary))"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda compacta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4">
        {data.slice(0, 6).map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: RFM_COLORS[d.label] ?? "hsl(var(--primary))" }}
            />
            <span className="text-xs text-muted-foreground">
              {d.labelPt} <span className="font-medium text-foreground">({d.count})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
