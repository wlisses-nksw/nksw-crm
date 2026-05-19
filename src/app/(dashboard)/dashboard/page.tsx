import { Header } from "@/components/layout/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RFMChart } from "@/components/dashboard/rfm-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { AbandonedCartsAlert } from "@/components/dashboard/abandoned-carts-alert";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getRFMDistribution } from "@/services/rfm.service";
import { startOfMonth, startOfDay } from "date-fns";
import { TaskStatus } from "@prisma/client";

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

interface PSEntry {
  id: string;
  name: string;
  total: number;
  pending: number;
  active: number;
  done: number;
  rate: number;
}

async function getPSPanelData(userId: string, role: string): Promise<PSEntry[]> {
  const todayStart = startOfDay(new Date());

  const where = {
    title: { startsWith: "PS |" },
    createdAt: { gte: todayStart },
    ...(role === "PERSONAL_SHOPPER" ? { assignedToId: userId } : {}),
  } as const;

  const tasks = await db.task.findMany({
    where,
    select: {
      status: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const map = new Map<string, PSEntry>();

  for (const task of tasks) {
    const psId = task.assignedTo?.id ?? "__unassigned__";
    const psName = task.assignedTo?.name ?? "Não atribuído";

    if (!map.has(psId)) {
      map.set(psId, { id: psId, name: psName, total: 0, pending: 0, active: 0, done: 0, rate: 0 });
    }

    const entry = map.get(psId)!;
    entry.total += 1;

    if (task.status === TaskStatus.PENDENTE) entry.pending += 1;
    else if (task.status === TaskStatus.EM_ANDAMENTO) entry.active += 1;
    else if (task.status === TaskStatus.CONCLUIDA) entry.done += 1;
  }

  for (const entry of map.values()) {
    entry.rate = entry.total > 0 ? Math.round((entry.done / entry.total) * 100) : 0;
  }

  return Array.from(map.values()).sort((a, b) => b.done - a.done);
}

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "VIEWER";
  const userId = session?.user?.id ?? "";

  const [data, psPanel] = await Promise.all([
    getDashboardData(),
    getPSPanelData(userId, role),
  ]);

  const isAdmin = role === "ADMIN" || role === "SUPERVISOR";
  const isPS = role === "PERSONAL_SHOPPER";

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

        {/* Painel Personal Shoppers */}
        {(isAdmin || isPS) && (
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Atividade Personal Shoppers — Hoje</h2>

            {psPanel.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa PS gerada hoje.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {psPanel.map((ps) => (
                  <div
                    key={ps.id}
                    className="rounded-md border bg-background p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{ps.name}</span>
                      <span className="ml-2 shrink-0 inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">
                        {ps.total} total
                      </span>
                    </div>

                    {/* Barra de progresso */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progresso</span>
                        <span>{ps.rate}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${ps.rate}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Pendente</p>
                        <p className="text-sm font-semibold">{ps.pending}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Em andamento</p>
                        <p className="text-sm font-semibold">{ps.active}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Concluídas</p>
                        <p className="text-sm font-semibold text-green-600">{ps.done}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Atividade recente — só para Admin/Supervisor */}
        {(isAdmin || !isPS) && (
          <RecentActivity customers={data.recentCustomers} />
        )}
      </div>
    </div>
  );
}
