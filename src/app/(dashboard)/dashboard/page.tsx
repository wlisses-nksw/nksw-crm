import { Header } from "@/components/layout/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RFMChart } from "@/components/dashboard/rfm-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { AbandonedCartsAlert } from "@/components/dashboard/abandoned-carts-alert";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getRFMDistribution } from "@/services/rfm.service";
import { startOfMonth } from "date-fns";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const now = new Date();
  const som = startOfMonth(now);

  const [
    totalCustomers,
    newCustomers,
    vipCustomers,
    openTasks,
    abandonedCarts,
    rfmDistribution,
    revenue,
    recentCustomers,
  ] = await Promise.all([
    db.customer.count({ where: { deletedAt: null, active: true } }),
    db.customer.count({ where: { deletedAt: null, createdAt: { gte: som } } }),
    db.customer.count({ where: { deletedAt: null, segment: "VIP" } }),
    db.task.count({ where: { status: { in: ["PENDENTE", "EM_ANDAMENTO"] } } }),
    db.abandonedCart.aggregate({
      where: { recoveredAt: null },
      _count: { id: true },
      _sum: { totalPrice: true },
    }),
    getRFMDistribution(),
    db.order.aggregate({
      where: { financialStatus: "PAID", createdAt: { gte: som } },
      _sum: { totalPrice: true },
      _count: { id: true },
      _avg: { totalPrice: true },
    }),
    db.customer.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        segment: true,
        totalSpent: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    stats: {
      totalCustomers,
      newCustomers,
      vipCustomers,
      openTasks,
      abandonedCartsCount: abandonedCarts._count.id,
      abandonedCartsValue: Number(abandonedCarts._sum.totalPrice ?? 0),
      totalRevenue: Number(revenue._sum.totalPrice ?? 0),
      ordersCount: revenue._count.id,
      avgOrderValue: Number(revenue._avg.totalPrice ?? 0),
    },
    rfmDistribution,
    recentCustomers,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const data = await getDashboardData();

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Dashboard" />

      <div className="flex-1 p-6 space-y-6">
        {/* KPIs */}
        <StatsCards stats={data.stats} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* RFM Chart */}
          <div className="lg:col-span-2">
            <RFMChart distribution={data.rfmDistribution} />
          </div>

          {/* Carrinhos abandonados */}
          <div>
            <AbandonedCartsAlert
              count={data.stats.abandonedCartsCount}
              value={data.stats.abandonedCartsValue}
            />
          </div>
        </div>

        {/* Atividade recente */}
        <RecentActivity customers={data.recentCustomers} />
      </div>
    </div>
  );
}
