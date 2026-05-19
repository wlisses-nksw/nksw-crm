import { db } from "@/lib/db";
import type { RFMScore, RFMLabel } from "@/types";
import { differenceInDays } from "date-fns";
import { CustomerSegment } from "@prisma/client";

// ============================================================
// Cálculo RFM
// ============================================================

interface RFMInput {
  customerId: string;
  lastOrderAt: Date | null;
  ordersCount: number;
  totalSpent: number;
}

export function calculateRFMScore(input: RFMInput, benchmarks: RFMBenchmarks): RFMScore {
  const recency = scoreRecency(input.lastOrderAt, benchmarks.recency);
  const frequency = scoreFrequency(input.ordersCount, benchmarks.frequency);
  const monetary = scoreMonetary(input.totalSpent, benchmarks.monetary);

  const total = recency * 100 + frequency * 10 + monetary;
  const label = getRFMLabel(recency, frequency, monetary);
  const segment = rfmLabelToSegment(label);

  return { recency, frequency, monetary, total, label, segment };
}

function scoreRecency(lastOrderAt: Date | null, benchmarks: number[]): number {
  if (!lastOrderAt) return 1;
  const days = differenceInDays(new Date(), lastOrderAt);
  if (days <= benchmarks[0]) return 5;
  if (days <= benchmarks[1]) return 4;
  if (days <= benchmarks[2]) return 3;
  if (days <= benchmarks[3]) return 2;
  return 1;
}

function scoreFrequency(count: number, benchmarks: number[]): number {
  if (count >= benchmarks[3]) return 5;
  if (count >= benchmarks[2]) return 4;
  if (count >= benchmarks[1]) return 3;
  if (count >= benchmarks[0]) return 2;
  return 1;
}

function scoreMonetary(spent: number, benchmarks: number[]): number {
  if (spent >= benchmarks[3]) return 5;
  if (spent >= benchmarks[2]) return 4;
  if (spent >= benchmarks[1]) return 3;
  if (spent >= benchmarks[0]) return 2;
  return 1;
}

export interface RFMBenchmarks {
  recency: number[];   // dias: [30, 60, 120, 180]
  frequency: number[]; // pedidos: [1, 2, 4, 6]
  monetary: number[];  // R$: [200, 500, 1000, 2000]
}

// Benchmarks padrão NKSW
export const DEFAULT_BENCHMARKS: RFMBenchmarks = {
  recency: [30, 60, 120, 180],
  frequency: [1, 2, 4, 6],
  monetary: [200, 500, 1000, 2000],
};

function getRFMLabel(r: number, f: number, m: number): RFMLabel {
  const rf = r * 10 + f;
  if (rf >= 55) return "Champions";
  if (r >= 4 && f >= 4) return "Loyal Customers";
  if (r >= 3 && f >= 3) return "Potential Loyalists";
  if (r >= 4 && f <= 1) return "Recent Customers";
  if (r >= 3 && f <= 2 && m >= 3) return "Promising";
  if (r === 3 && f === 3) return "Needs Attention";
  if (r >= 2 && f <= 2) return "About To Sleep";
  if (r <= 2 && f >= 3 && m >= 3) return "At Risk";
  if (r <= 1 && f >= 4 && m >= 4) return "Cannot Lose Them";
  if (r <= 2 && f <= 2) return "Hibernating";
  return "Lost";
}

function rfmLabelToSegment(label: RFMLabel): string {
  const map: Record<RFMLabel, CustomerSegment> = {
    Champions: CustomerSegment.VIP,
    "Loyal Customers": CustomerSegment.VIP,
    "Potential Loyalists": CustomerSegment.ALTO_POTENCIAL,
    "Recent Customers": CustomerSegment.PRIMEIRA_COMPRA,
    Promising: CustomerSegment.ALTO_POTENCIAL,
    "Needs Attention": CustomerSegment.EM_RISCO,
    "About To Sleep": CustomerSegment.EM_RISCO,
    "At Risk": CustomerSegment.EM_RISCO,
    "Cannot Lose Them": CustomerSegment.EM_RISCO,
    Hibernating: CustomerSegment.INATIVO,
    Lost: CustomerSegment.INATIVO,
  };
  return map[label];
}

// ============================================================
// Recalcular RFM de todos os clientes
// ============================================================

export async function recalculateAllRFM(): Promise<number> {
  const customers = await db.customer.findMany({
    where: { deletedAt: null, active: true },
    select: {
      id: true,
      totalSpent: true,
      ordersCount: true,
      lastOrderAt: true,
    },
  });

  let updated = 0;

  for (const c of customers) {
    const rfm = calculateRFMScore(
      {
        customerId: c.id,
        lastOrderAt: c.lastOrderAt,
        ordersCount: c.ordersCount ?? 0,
        totalSpent: Number(c.totalSpent ?? 0),
      },
      DEFAULT_BENCHMARKS
    );

    await db.customer.update({
      where: { id: c.id },
      data: {
        rfmScore: rfm.total,
        rfmRecency: rfm.recency,
        rfmFrequency: rfm.frequency,
        rfmMonetary: rfm.monetary,
        rfmLabel: rfm.label,
        segment: rfmLabelToSegment(rfm.label) as CustomerSegment,
      },
    });

    // Salva no histórico de scores
    await db.customerScore.upsert({
      where: {
        // Upsert por tipo mais recente — usamos create + delete ou findFirst
        id: (
          await db.customerScore.findFirst({
            where: { customerId: c.id, scoreType: "rfm" },
            select: { id: true },
          })
        )?.id ?? "new",
      },
      create: {
        customerId: c.id,
        scoreType: "rfm",
        score: rfm.total,
        label: rfm.label,
        metadata: rfm as object,
      },
      update: {
        score: rfm.total,
        label: rfm.label,
        metadata: rfm as object,
        calculatedAt: new Date(),
      },
    });

    updated++;
  }

  return updated;
}

// ============================================================
// Recalcular RFM para lista de IDs (cron incremental — evita timeout)
// ============================================================

export async function recalculateRFMForCustomers(customerIds: string[]): Promise<number> {
  if (!customerIds.length) return 0;

  const customers = await db.customer.findMany({
    where: { id: { in: customerIds }, deletedAt: null },
    select: { id: true, totalSpent: true, ordersCount: true, lastOrderAt: true },
  });

  let updated = 0;
  for (const c of customers) {
    const rfm = calculateRFMScore(
      {
        customerId: c.id,
        lastOrderAt: c.lastOrderAt,
        ordersCount: c.ordersCount ?? 0,
        totalSpent: Number(c.totalSpent ?? 0),
      },
      DEFAULT_BENCHMARKS
    );

    await db.customer.update({
      where: { id: c.id },
      data: {
        rfmScore: rfm.total,
        rfmRecency: rfm.recency,
        rfmFrequency: rfm.frequency,
        rfmMonetary: rfm.monetary,
        rfmLabel: rfm.label,
        segment: rfmLabelToSegment(rfm.label) as CustomerSegment,
      },
    });
    updated++;
  }
  return updated;
}

// ============================================================
// RFM de um único cliente
// ============================================================

export async function recalculateCustomerRFM(customerId: string): Promise<RFMScore> {
  const customer = await db.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { id: true, totalSpent: true, ordersCount: true, lastOrderAt: true },
  });

  const rfm = calculateRFMScore(
    {
      customerId: customer.id,
      lastOrderAt: customer.lastOrderAt,
      ordersCount: customer.ordersCount ?? 0,
      totalSpent: Number(customer.totalSpent ?? 0),
    },
    DEFAULT_BENCHMARKS
  );

  await db.customer.update({
    where: { id: customerId },
    data: {
      rfmScore: rfm.total,
      rfmRecency: rfm.recency,
      rfmFrequency: rfm.frequency,
      rfmMonetary: rfm.monetary,
      rfmLabel: rfm.label,
      segment: rfmLabelToSegment(rfm.label) as CustomerSegment,
    },
  });

  return rfm;
}

// ============================================================
// Distribuição RFM para dashboard
// ============================================================

export async function getRFMDistribution(): Promise<Record<string, number>> {
  const result = await db.customer.groupBy({
    by: ["rfmLabel"],
    where: { deletedAt: null, rfmLabel: { not: null } },
    _count: { rfmLabel: true },
  });

  return Object.fromEntries(
    result.map((r) => [r.rfmLabel ?? "Unknown", r._count.rfmLabel])
  );
}
