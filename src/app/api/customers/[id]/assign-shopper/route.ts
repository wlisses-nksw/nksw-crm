import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const bodySchema = z.object({
  shopperId: z.string().nullable(),
  fidelized: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { shopperId, fidelized } = parsed.data;
  const role = session.user.role;

  // PERSONAL_SHOPPER só pode fidelizar para si mesmo
  if (role === "PERSONAL_SHOPPER") {
    if (shopperId !== null && shopperId !== session.user.id) {
      return NextResponse.json(
        { error: "Personal Shopper só pode fidelizar clientes para si mesmo" },
        { status: 403 }
      );
    }
  } else if (role !== "ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  let data: {
    assignedShopperId: string | null;
    assignedShopperAt: Date | null;
    fidelized: boolean;
  };

  if (shopperId === null) {
    // Liberar cliente
    data = {
      assignedShopperId: null,
      assignedShopperAt: null,
      fidelized: false,
    };
  } else {
    data = {
      assignedShopperId: shopperId,
      assignedShopperAt: new Date(),
      fidelized: fidelized ?? false,
    };
  }

  const customer = await db.customer.update({
    where: { id },
    data,
    select: {
      id: true,
      assignedShopperId: true,
      assignedShopperAt: true,
      fidelized: true,
      assignedShopper: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ data: customer });
}
