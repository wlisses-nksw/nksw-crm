import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET — lista PS users ativos (qualquer role autenticada pode chamar)
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const shoppers = await db.user.findMany({
    where: {
      role: "PERSONAL_SHOPPER",
      active: true,
      onVacation: false,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: shoppers });
}
