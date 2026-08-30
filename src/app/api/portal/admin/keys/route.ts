import { NextResponse } from "next/server";
import { ensurePortalInitialized } from "@/lib/portal/server";
import { requireSession, isSessionError, isAdmin } from "@/lib/portal/session";
import { listLicenses, generateKeys } from "@/lib/portal/store";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensurePortalInitialized();
  const session = await requireSession();
  if (isSessionError(session) || !isAdmin(session)) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }
  const licenses = await listLicenses();
  const summary = {
    total: licenses.length,
    available: licenses.filter((l) => l.status === "available").length,
    active: licenses.filter((l) => l.status === "active").length,
    revoked: licenses.filter((l) => l.status === "revoked").length
  };
  return NextResponse.json({ ok: true, licenses, summary });
}

export async function POST(req: Request) {
  await ensurePortalInitialized();
  const session = await requireSession();
  if (isSessionError(session) || !isAdmin(session)) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  let body: { count?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid request" }, { status: 400 });
  }
  const count = Math.min(2000, Math.max(1, Math.floor(Number(body.count) || 1)));
  const created = await generateKeys(count);
  return NextResponse.json({ ok: true, created });
}
