import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensurePortalInitialized } from "@/lib/portal/server";
import {
  getUserWithHashByEmail,
  verifyPassword,
  createSession,
  setUserLastLogin
} from "@/lib/portal/store";
import { SESSION_COOKIE } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensurePortalInitialized();

  let body: { email?: string; password?: string; deviceFingerprint?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid request" }, { status: 400 });
  }

  const email = (body.email || "").trim();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required" }, { status: 400 });
  }

  const user = await getUserWithHashByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ ok: false, error: "Invalid email or password" }, { status: 401 });
  }
  if (user.revoked) {
    return NextResponse.json({ ok: false, error: "This account has been revoked" }, { status: 403 });
  }

  // Non-admin users are device-bound: the logging-in device must match the
  // device their license was activated on (or, for admins, any device is fine).
  if (user.role !== "admin" && user.deviceFingerprint && body.deviceFingerprint) {
    const loginDevice = (body.deviceFingerprint || "").trim();
    if (user.deviceFingerprint && loginDevice && user.deviceFingerprint !== loginDevice) {
      return NextResponse.json(
        { ok: false, error: "This account is bound to another device (HWID mismatch)" },
        { status: 403 }
      );
    }
  }

  await setUserLastLogin(user.id);

  const publicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    licenseKey: user.licenseKey,
    deviceFingerprint: user.deviceFingerprint,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    revoked: user.revoked
  };

  const session = await createSession(publicUser);
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return NextResponse.json({ ok: true, user: publicUser });
}
