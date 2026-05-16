import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listCustomers } from "@/services/customer.service";
import type { CustomerSegment } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  const result = await listCustomers({
    search: sp.get("search") ?? undefined,
    segment: (sp.get("segment") as CustomerSegment) ?? undefined,
    assignedShopperId: sp.get("shopperId") ?? undefined,
    page: parseInt(sp.get("page") ?? "1"),
    pageSize: parseInt(sp.get("pageSize") ?? "30"),
    orderBy: (sp.get("orderBy") as "name" | "totalSpent" | "lastOrderAt" | "rfmScore") ?? undefined,
    orderDir: (sp.get("orderDir") as "asc" | "desc") ?? undefined,
  });

  return NextResponse.json(result);
}
