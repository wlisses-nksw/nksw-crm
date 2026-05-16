import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRFMDistribution } from "@/services/rfm.service";
import { startOfMonth, subMonths } from "date-fns";
import type { DashboardStats } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const now = new Date();
  const startOfCurrentMonth = startOfMonth(now);
  const startOfLastMonth = startOfMonth(subMonths(now, 1));

  const [
    totalCustomers,
    newCustomersThisMonth,
    vipCustomers,
    openTasks,
    abandonedCarts,
    rfmDistribution,
    revenueThisMonth,
  ] = await Promise.all([
    db.customer.count({ where: { deletedAt: null, active: true } }),

    db.customer.count({
      where: { deletedAt: null, createdAt: { gte: startOfCurrentMonth } },
    }),

    db.customer.count({
      where: { deletedAt: null, segment: "VIP" },
    }),

    db.task.count({
      where: { status: { in: ["PENDENTE", "EM_ANDAMENTO"] } },
    }),

    db.abandonedCart.aggregate({
      where: { recoveredAt: null },
      _count: { id: true },
      _sum: { totalPrice: true },
    }),

    getRFMDistribution(),

    db.order.aggregate({
      where: {
        financialStatus: "PAID",
        createdAt: { gte: startOfCurrentMonth },
      },
      _sum: { totalPrice: true },
      _count: { id: true },
      _avg: { totalPrice: true },
    }),
  ]);

  const stats: DashboardStats = {
    totalCustomers,
    newCustomersThisMonth,
    activeCustomers: totalCustomers,
    vipCustomers,
    totalRevenue: Number(revenueThisMonth._sum.totalPrice ?? 0),
    averageOrderValue: Number(revenueThisMonth._avg.totalPrice ?? 0),
    abandonedCartsCount: abandonedCarts._count.id,
    abandonedCartsValue: Number(abandonedCarts._sum.totalPrice ?? 0),
    openTasks,
    conversionRate: 0, // calculado via GA4
    rfmDistribution,
    topPersonalShoppers: [], // calculado separadamente
  };

  return NextResponse.json({ data: stats });
}
