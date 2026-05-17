import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const engagements = await db.emailEngagement.findMany({
    where: { customerId: id },
    orderBy: { sentAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ data: engagements });
}
