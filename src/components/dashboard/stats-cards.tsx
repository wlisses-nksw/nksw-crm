"use client";

import { formatCurrency } from "@/lib/utils";
import {
  Users,
  UserPlus,
  Crown,
  ShoppingCart,
  TrendingUp,
  ClipboardList,
} from "lucide-react";

interface StatsCardsProps {
  stats: {
    totalCustomers: number;
    newCustomers: number;
    vipCustomers: number;
    openTasks: number;
    abandonedCartsCount: number;
    abandonedCartsValue: number;
    totalRevenue: number;
    ordersCount: number;
    avgOrderValue: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Total de Clientes",
      value: stats.totalCustomers.toLocaleString("pt-BR"),
      sub: `+${stats.newCustomers} este mês`,
      icon: Users,
      iconClass: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    },
    {
      label: "Receita do Mês",
      value: formatCurrency(stats.totalRevenue),
      sub: `${stats.ordersCount} pedidos`,
      icon: TrendingUp,
      iconClass: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    },
    {
      label: "Clientes VIP",
      value: stats.vipCustomers.toLocaleString("pt-BR"),
      sub: `Ticket médio: ${formatCurrency(stats.avgOrderValue)}`,
      icon: Crown,
      iconClass: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    },
    {
      label: "Carrinhos Abandonados",
      value: stats.abandonedCartsCount.toLocaleString("pt-BR"),
      sub: `${formatCurrency(stats.abandonedCartsValue)} em risco`,
      icon: ShoppingCart,
      iconClass: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    },
    {
      label: "Tarefas Abertas",
      value: stats.openTasks.toLocaleString("pt-BR"),
      sub: "Pendentes e em andamento",
      icon: ClipboardList,
      iconClass: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    },
    {
      label: "Novos Este Mês",
      value: stats.newCustomers.toLocaleString("pt-BR"),
      sub: "Clientes cadastrados",
      icon: UserPlus,
      iconClass: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.iconClass}`}>
            <card.icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">{card.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
