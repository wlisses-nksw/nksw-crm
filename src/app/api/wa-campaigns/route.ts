import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { VOLL_CAMPAIGNS } from "@/lib/voll";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  return NextResponse.json({ campaigns: VOLL_CAMPAIGNS });
}
