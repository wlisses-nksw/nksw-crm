import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { globalSearch } from "@/services/customer.service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await globalSearch(q, 10);

  return NextResponse.json({ data: results });
}
