import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const carts = await db.abandonedCart.findMany({
    where: { recoveredAt: null },
    orderBy: { abandonedAt: "desc" },
    take: 200,
    include: {
      customer: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, segment: true },
      },
    },
  });

  return NextResponse.json({ data: carts, total: carts.length });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, action } = await req.json() as { id: string; action: "contacted" | "uncontacted" };

  await db.abandonedCart.update({
    where: { id },
    data: { contactedAt: action === "contacted" ? new Date() : null },
  });

  return NextResponse.json({ ok: true });
}
