import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route guard for page navigation. This is a convenience layer only: the API
 * re-checks the session and the role (from the database) on every request.
 *
 * - "Signed in" = an access token, or a refresh token the API can renew (7 days).
 * - The non-secret `role` cookie decides customer portal vs staff app.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/tasks",
  "/users",
  "/settings",
  "/notifications",
  "/audit-logs",
  "/chat",
  "/home",
  "/admin",
  "/receipts",
  "/org",
  "/platform",
  "/planner"
];
// The product owner's console, and the only areas that role uses
const PLATFORM_PREFIXES = ["/platform"];
const PLATFORM_OWNER_PREFIXES = ["/platform", "/settings", "/notifications"];
const STAFF_ONLY_PREFIXES = ["/dashboard", "/tasks", "/users", "/audit-logs", "/admin", "/org"];
const CUSTOMER_ONLY_PREFIXES = ["/home"];
const AUTH_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];

const startsWithAny = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get("accessToken")?.value || request.cookies.get("refreshToken")?.value);
  const role = request.cookies.get("role")?.value;
  const home =
    role === "platform_owner" ? "/platform" : role === "customer" ? "/home" : role === "leadership" ? "/admin/overview" : "/dashboard";

  if (pathname === "/") {
    return NextResponse.redirect(new URL(signedIn ? home : "/login", request.url));
  }

  if (startsWithAny(pathname, PROTECTED_PREFIXES) && !signedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (signedIn && role) {
    if (role === "platform_owner" && startsWithAny(pathname, PROTECTED_PREFIXES) && !startsWithAny(pathname, PLATFORM_OWNER_PREFIXES)) {
      return NextResponse.redirect(new URL("/platform", request.url));
    }
    if (role !== "platform_owner" && startsWithAny(pathname, PLATFORM_PREFIXES)) {
      return NextResponse.redirect(new URL(home, request.url));
    }
    if (role === "customer" && startsWithAny(pathname, STAFF_ONLY_PREFIXES)) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
    if (role !== "customer" && startsWithAny(pathname, CUSTOMER_ONLY_PREFIXES)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (startsWithAny(pathname, AUTH_PREFIXES) && signedIn && role) {
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/tasks/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/notifications/:path*",
    "/audit-logs/:path*",
    "/chat/:path*",
    "/home/:path*",
    "/admin/:path*",
    "/receipts/:path*",
    "/org/:path*",
    "/platform/:path*",
    "/planner/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password/:path*"
  ]
};
