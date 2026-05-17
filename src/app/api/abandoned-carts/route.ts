import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const carts = await db.abandonedCart.findMany({
    where: { recoveredAt: null },
    orderBy: { abandonedAt: "desc" },
    take: 100,
    include: {
      customer: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, segment: true },
      },
    },
  });

  return NextResponse.json({ data: carts, total: carts.length });
}
