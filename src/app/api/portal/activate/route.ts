import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensurePortalInitialized } from "@/lib/portal/server";
import {
  getLicense,
  setLicense,
  createUser,
  normalizeKey,
  createSession
} from "@/lib/portal/store";
import { SESSION_COOKIE } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensurePortalInitialized();

  let body: {
    licenseKey?: string;
    email?: string;
    name?: string;
    password?: string;
    deviceFingerprint?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid request" }, { status: 400 });
  }

  const rawKey = (body.licenseKey || "").trim().toUpperCase();
  const key = normalizeKey(rawKey);
  const device = (body.deviceFingerprint || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim();
  const password = body.password || "";

  if (!key) {
    return NextResponse.json({ ok: false, error: "A license key is required" }, { status: 400 });
  }
  if (!device) {
    return NextResponse.json({ ok: false, error: "Could not read device fingerprint" }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ ok: false, error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const license = await getLicense(key);
  if (!license) {
    return NextResponse.json({ ok: false, error: "Invalid license key" }, { status: 404 });
  }
  if (license.status === "revoked") {
    return NextResponse.json({ ok: false, error: "This license key has been revoked" }, { status: 403 });
  }
  if (license.status === "active") {
    if (license.deviceFingerprint && license.deviceFingerprint !== device) {
      return NextResponse.json(
        { ok: false, error: "This license key is already bound to another device" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "This license key is already in use. Log in instead." },
      { status: 409 }
    );
  }

  const created = await createUser({
    email,
    name,
    password,
    licenseKey: key,
    deviceFingerprint: device
  });

  if ("error" in created) {
    return NextResponse.json({ ok: false, error: created.error }, { status: 409 });
  }

  await setLicense(key, {
    status: "active",
    assignedEmail: email,
    deviceFingerprint: device,
    activatedAt: new Date().toISOString()
  });

  const session = await createSession(created);
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return NextResponse.json({ ok: true, user: created, licenseKey: key });
}
