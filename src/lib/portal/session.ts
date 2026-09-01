import { cookies } from "next/headers";
import { getSession, type PortalSession } from "./store";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };

export async function requireSession(): Promise<PortalSession | { error: string }> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await getSession(token);
  if (!session) {
    return { error: "Not authenticated" };
  }
  return session;
}

export function isSessionError(
  s: PortalSession | { error: string }
): s is { error: string } {
  return "error" in s;
}

export function isAdmin(session: PortalSession | { error: string }): session is PortalSession {
  return !isSessionError(session) && session.role === "admin";
}
