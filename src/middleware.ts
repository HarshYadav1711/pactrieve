import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
import {ACCESS_COOKIE, requestHasValidAccess} from "@/lib/access";

/**
 * When PACTRIEVE_ACCESS_TOKEN is configured, block anonymous /api access.
 * Unlock via POST /api/access (sets httpOnly cookie) or Authorization: Bearer.
 */
export function middleware(request: NextRequest) {
  const expected = (process.env.PACTRIEVE_ACCESS_TOKEN ?? "").trim();
  if (!expected) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  if (path === "/api/access" || path.startsWith("/api/access/")) {
    return NextResponse.next();
  }

  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  const ok = requestHasValidAccess({
    authorizationHeader: request.headers.get("authorization"),
    cookieValue: request.cookies.get(ACCESS_COOKIE)?.value
  });

  if (ok) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      error: "Access token required. Unlock this deployment before using APIs.",
      code: "ACCESS_REQUIRED"
    },
    {status: 401, headers: {"Cache-Control": "no-store"}}
  );
}

export const config = {
  matcher: ["/api/:path*"]
};
