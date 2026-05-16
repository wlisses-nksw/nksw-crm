import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCustomerProfile, assignShopper, addNote, addTag, removeTag } from "@/services/customer.service";
import { refreshCustomerInsights } from "@/services/customer.service";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const customer = await getCustomerProfile(id);

  if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  return NextResponse.json({ data: customer });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const actionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("assign_shopper"), shopperId: z.string() }),
    z.object({ action: z.literal("add_note"), content: z.string().min(1) }),
    z.object({ action: z.literal("add_tag"), tag: z.string().min(1) }),
    z.object({ action: z.literal("remove_tag"), tag: z.string().min(1) }),
    z.object({ action: z.literal("refresh_insights") }),
    z.object({
      action: z.literal("update"),
      data: z.record(z.unknown()),
    }),
  ]);

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const payload = parsed.data;

  switch (payload.action) {
    case "assign_shopper":
      await assignShopper(id, payload.shopperId, session.user.id);
      break;

    case "add_note":
      await addNote(id, payload.content, session.user.id);
      break;

    case "add_tag":
      await addTag(id, payload.tag);
      break;

    case "remove_tag":
      await removeTag(id, payload.tag);
      break;

    case "refresh_insights":
      await refreshCustomerInsights(id);
      break;

    case "update": {
      const allowed = ["phone", "city", "state", "segment", "acceptsMarketing"];
      const data = Object.fromEntries(
        Object.entries(payload.data).filter(([k]) => allowed.includes(k))
      );
      await db.customer.update({ where: { id }, data });

      await db.auditLog.create({
        data: {
          userId: session.user.id,
          action: "UPDATE_CUSTOMER",
          resource: "customer",
          resourceId: id,
          newData: data as Record<string, unknown>,
        },
      });
      break;
    }
  }

  return NextResponse.json({ success: true });
}
