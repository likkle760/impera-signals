import { NextResponse } from "next/server";
import { ensurePortalInitialized } from "@/lib/portal/server";
import { requireSession, isSessionError, isAdmin } from "@/lib/portal/session";
import { listUsers } from "@/lib/portal/store";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensurePortalInitialized();
  const session = await requireSession();
  if (isSessionError(session) || !isAdmin(session)) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, users: await listUsers() });
}
