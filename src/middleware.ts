import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/portal/constants";

const PUBLIC_PATHS = ["/login", "/api", "/_next", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  if (isPublic) {
    return NextResponse.next();
  }

  // If already authenticated, keep going.
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const res = NextResponse.redirect(loginUrl);
  return res;
}

export const config = {
  matcher: [
    // Run on all routes except need to protect everything meaningful.
    "/((?!api|_next|favicon.ico).*)"
  ]
};
