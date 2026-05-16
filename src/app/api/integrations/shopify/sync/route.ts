import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncShopify } from "@/services/sync.service";
import { hasPermission } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!hasPermission(session.user.role, "GERENTE")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { incremental } = await req.json().catch(() => ({}));

  const result = await syncShopify({
    incrementalHours: incremental ? 2 : undefined,
  });

  return NextResponse.json(result);
}
