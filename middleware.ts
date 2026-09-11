import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("accessToken")?.value;
  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard") ||
                           request.nextUrl.pathname.startsWith("/tasks") ||
                           request.nextUrl.pathname.startsWith("/users") ||
                           request.nextUrl.pathname.startsWith("/settings") ||
                           request.nextUrl.pathname.startsWith("/notifications") ||
                           request.nextUrl.pathname.startsWith("/audit-logs");

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
                      request.nextUrl.pathname.startsWith("/signup") ||
                      request.nextUrl.pathname.startsWith("/forgot-password") ||
                      request.nextUrl.pathname.startsWith("/reset-password");

  if (isDashboardRoute && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tasks/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/notifications/:path*",
    "/audit-logs/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password/:path*"
  ]
};
