import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 快速檢查：沒有 session cookie 的請求，頁面導到 /login、API 回 401。
 * 這只看 cookie 在不在，不驗證真偽；真正的驗證在 src/app/session.ts 的 requireUser。
 */
export function proxy(request: NextRequest): NextResponse {
  if (getSessionCookie(request) !== null) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // /login、登入 API、MCP（自己用權杖驗證）、靜態資源不攔。
  matcher: ["/((?!login|api/auth|api/mcp|_next/static|_next/image|favicon.ico).*)"],
};
