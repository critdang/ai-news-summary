import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/api/telegram",
  "/api/cron",
  "/api/internal",
  "/api/fever",
];

function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const requestHost = req.headers.get("host") || req.nextUrl.host;

  if (origin) {
    try {
      return new URL(origin).host === requestHost;
    } catch {
      return false;
    }
  }
  if (referer) {
    try {
      return new URL(referer).host === requestHost;
    } catch {
      return false;
    }
  }
  // No Origin/Referer — allow same-origin browser navigation and XHR.
  return true;
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  const isPublicPage = pathname === "/login" || pathname === "/register" || pathname === "/setup" || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  const hasSessionCookie = req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  if (!isPublicPage && !pathname.startsWith("/api/") && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // CSRF protection for state-changing methods.
  const method = req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const isAuthJsRoute = pathname.startsWith("/api/auth/") && pathname !== "/api/auth/register";
    const isCsrfExempt = isAuthJsRoute || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (!isCsrfExempt && !isValidOrigin(req)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|screenshots/|.*\\.(?:svg|png|jpg|jpeg|gif|ico|webmanifest|js|txt|xml|woff2?)$).*)",
  ],
};
