import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensurePortalInitialized } from "@/lib/portal/server";
import { getSession, getUserById } from "@/lib/portal/store";
import { SESSION_COOKIE } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensurePortalInitialized();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }
  const user = await getUserById(session.userId);
  if (!user || user.revoked) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, authenticated: true, user });
}
