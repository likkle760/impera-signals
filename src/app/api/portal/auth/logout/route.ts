import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/portal/store";
import { SESSION_COOKIE } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
