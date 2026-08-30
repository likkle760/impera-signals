import { initPortal } from "./store";

const DEFAULT_ADMIN_EMAIL = "Imperafrx@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "Nezoba24";
const DEFAULT_LICENSE_COUNT = 1000;

/**
 * Ensure the portal data file exists and is seeded. Call once at app startup.
 * Reads admin credential + license count from env (falls back to CEO defaults).
 */
export async function ensurePortalInitialized(): Promise<void> {
  const email = process.env.PORTAL_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  const password = process.env.PORTAL_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const count = Number(process.env.PORTAL_LICENSE_COUNT || DEFAULT_LICENSE_COUNT);
  await initPortal({
    adminEmail: email,
    adminPassword: password,
    licenseCount: Number.isFinite(count) && count > 0 ? count : DEFAULT_LICENSE_COUNT
  });
}

export const ADMIN_ROLE = "admin" as const;
