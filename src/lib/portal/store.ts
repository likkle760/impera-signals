import crypto from "node:crypto";
import { loadPortalData, persistPortalData } from "./persistence";
import type {
  LicenseKey,
  PortalData,
  PortalSession,
  PortalUser,
  StoredUser
} from "./store-types";

export type {
  LicenseKey,
  PortalData,
  PortalSession,
  PortalUser,
  StoredUser
} from "./store-types";

/**
 * Portal data store — backed by PostgreSQL when DATABASE_URL is set, otherwise
 * a single JSON file on the server (see persistence.ts).
 *
 * NOTE: This stores user credentials and license keys. Keep it private and never
 * commit it. Access-control decisions are made here (server side) so clients
 * cannot read or tamper with other users' data.
 */

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const KEY_PREFIX = "IMPERA";

export interface InitOptions {
  adminEmail: string;
  adminPassword: string;
  licenseCount: number;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return candidate === hash;
}

export function generateLicenseKey(prefix = KEY_PREFIX, groups = 4): string {
  const rand = (len: number) =>
    Array.from(crypto.randomBytes(len))
      .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 36])
      .join("");
  const parts: string[] = [];
  for (let i = 0; i < groups; i++) parts.push(rand(4));
  return `${prefix}-${parts.join("-")}`;
}

/**
 * Normalize a user-typed license key: strip separators, uppercase, then rebuild
 * as IMPERA-XXXX-XXXX-XXXX so input like "im-pera xxxx-xxxxxx xxxx" still matches.
 */
export function normalizeKey(input: string): string {
  const cleaned = (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("IMPERA") && cleaned.length >= 16) {
    const body = cleaned.replace(/^IMPERA/, "");
    const groups: string[] = [];
    for (let i = 0; i < 4; i++) {
      groups.push(body.slice(i * 4, i * 4 + 4));
    }
    return `IMPERA-${groups.join("-")}`;
  }
  return cleaned;
}

function emptyData(): PortalData {
  return { version: 1, users: [], licenses: [], sessions: [] };
}

let cache: PortalData | null = null;

async function load(): Promise<PortalData> {
  if (cache) return cache;
  const parsed = await loadPortalData();
  if (parsed) {
    const clean: PortalData = {
      version: 1,
      users: Array.isArray(parsed.users) ? parsed.users : [],
      licenses: Array.isArray(parsed.licenses) ? parsed.licenses : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
    cache = clean;
    return clean;
  }
  const fresh = emptyData();
  cache = fresh;
  return fresh;
}

async function persist(): Promise<void> {
  const data = cache;
  if (!data) return;
  await persistPortalData(data);
}

/**
 * Idempotent first-run init: seeds the admin account and pre-generates the
 * license key pool. Safe to call on every startup (matches are skipped).
 */
export async function initPortal(opts: InitOptions): Promise<void> {
  const data = await load();
  let changed = false;

  const admin = data.users.find((u) => u.email.toLowerCase() === opts.adminEmail.toLowerCase());
  if (!admin) {
    data.users.push({
      id: crypto.randomUUID(),
      email: opts.adminEmail.toLowerCase(),
      name: "Admin",
      role: "admin",
      licenseKey: "OWNERSHIP",
      deviceFingerprint: "",
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      revoked: false,
      passwordHash: hashPassword(opts.adminPassword)
    });
    changed = true;
  }

  const existing = new Set(data.licenses.map((l) => l.key));
  const needed = Math.max(0, opts.licenseCount - existing.size);
  for (let i = 0; i < needed; i++) {
    let key = generateLicenseKey();
    while (existing.has(key)) key = generateLicenseKey();
    data.licenses.push({
      key,
      status: "available",
      assignedEmail: null,
      deviceFingerprint: null,
      activatedAt: null,
      createdAt: new Date().toISOString()
    });
    existing.add(key);
    changed = true;
  }

  if (changed) await persist();
}

export function clearCache(): void {
  cache = null;
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  licenseKey: string;
  deviceFingerprint: string;
}): Promise<PortalUser | { error: string }> {
  const data = await load();
  if (data.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    return { error: "An account with this email already exists" };
  }
  const user: StoredUser = {
    id: crypto.randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name || input.email.split("@")[0],
    role: "user",
    licenseKey: input.licenseKey,
    deviceFingerprint: input.deviceFingerprint,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    revoked: false,
    passwordHash: hashPassword(input.password)
  };
  data.users.push(user);
  await persist();
  return stripUser(user);
}

export async function listUsers(): Promise<PortalUser[]> {
  const data = await load();
  return data.users.map(stripUser);
}

export async function getUserByEmail(email: string): Promise<PortalUser | undefined> {
  const data = await load();
  return data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function getUserById(id: string): Promise<PortalUser | undefined> {
  const data = await load();
  const u = data.users.find((x) => x.id === id);
  return u ? stripUser(u) : undefined;
}

export async function getUserWithHashByEmail(email: string): Promise<StoredUser | undefined> {
  const data = await load();
  return data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

function stripUser(u: StoredUser): PortalUser {
  const { passwordHash, ...rest } = u;
  return rest;
}

export async function setUserLastLogin(id: string): Promise<void> {
  const data = await load();
  const u = data.users.find((x) => x.id === id);
  if (u) {
    u.lastLoginAt = new Date().toISOString();
    await persist();
  }
}

export async function setUserRevoked(id: string, revoked: boolean): Promise<void> {
  const data = await load();
  const u = data.users.find((x) => x.id === id);
  if (u) {
    u.revoked = revoked;
    await persist();
  }
}

// ── Licenses ───────────────────────────────────────────────────────────────

export async function getLicense(key: string): Promise<LicenseKey | undefined> {
  const data = await load();
  return data.licenses.find((l) => l.key === key);
}

export async function listLicenses(): Promise<LicenseKey[]> {
  const data = await load();
  return data.licenses;
}

export async function setLicense(
  key: string,
  patch: Partial<Pick<LicenseKey, "status" | "assignedEmail" | "deviceFingerprint" | "activatedAt">>
): Promise<void> {
  const data = await load();
  const l = data.licenses.find((x) => x.key === key);
  if (!l) return;
  Object.assign(l, patch);
  await persist();
}

export async function generateKeys(count: number): Promise<LicenseKey[]> {
  const data = await load();
  const existing = new Set(data.licenses.map((l) => l.key));
  const created: LicenseKey[] = [];
  let made = 0;
  while (made < count) {
    const key = generateLicenseKey();
    if (existing.has(key)) continue;
    const lic: LicenseKey = {
      key,
      status: "available",
      assignedEmail: null,
      deviceFingerprint: null,
      activatedAt: null,
      createdAt: new Date().toISOString()
    };
    data.licenses.push(lic);
    existing.add(key);
    created.push(lic);
    made++;
  }
  await persist();
  return created;
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(user: PortalUser): Promise<PortalSession> {
  const data = await load();
  const token = crypto.randomBytes(32).toString("hex");
  const session: PortalSession = {
    token,
    userId: user.id,
    email: user.email,
    role: user.role,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString()
  };
  data.sessions.push(session);
  await persist();
  return session;
}

export async function getSession(token: string | undefined): Promise<PortalSession | undefined> {
  if (!token) return undefined;
  const data = await load();
  const s = data.sessions.find((x) => x.token === token);
  if (!s) return undefined;
  if (new Date(s.expiresAt).getTime() < Date.now()) {
    data.sessions = data.sessions.filter((x) => x.token !== token);
    await persist();
    return undefined;
  }
  return s;
}

export async function deleteSession(token: string): Promise<void> {
  const data = await load();
  data.sessions = data.sessions.filter((x) => x.token !== token);
  await persist();
}

export async function revokeSessionsForUser(userId: string): Promise<void> {
  const data = await load();
  data.sessions = data.sessions.filter((x) => x.userId !== userId);
  await persist();
}
