import { NextResponse } from "next/server";
import { ensurePortalInitialized } from "@/lib/portal/server";
import { requireSession, isSessionError, isAdmin } from "@/lib/portal/session";
import {
  setUserRevoked,
  revokeSessionsForUser,
  getUserById,
  setLicense,
  getLicense
} from "@/lib/portal/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensurePortalInitialized();
  const session = await requireSession();
  if (isSessionError(session) || !isAdmin(session)) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  let body: { userId?: string; licenseKey?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid request" }, { status: 400 });
  }

  if (body.userId) {
    const user = await getUserById(body.userId);
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    if (user.role === "admin") {
      return NextResponse.json({ ok: false, error: "Cannot revoke an admin account" }, { status: 403 });
    }
    await setUserRevoked(user.id, true);
    await revokeSessionsForUser(user.id);
    const license = user.licenseKey ? await getLicense(user.licenseKey) : undefined;
    if (license && license.status === "active") {
      await setLicense(license.key, { status: "available", assignedEmail: null, deviceFingerprint: null, activatedAt: null });
    }
    return NextResponse.json({ ok: true, revoked: "user", id: user.id });
  }

  if (body.licenseKey) {
    const license = await getLicense(body.licenseKey);
    if (!license) {
      return NextResponse.json({ ok: false, error: "License not found" }, { status: 404 });
    }
    await setLicense(license.key, { status: "revoked" });
    return NextResponse.json({ ok: true, revoked: "license", key: license.key });
  }

  return NextResponse.json({ ok: false, error: "Provide userId or licenseKey" }, { status: 400 });
}
