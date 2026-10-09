import {NextResponse} from "next/server";
import type {NextRequest} from "next/server";
import {
  ACCESS_COOKIE,
  accessGateMisconfigured,
  configuredAccessToken,
  requestHasValidAccess
} from "@/lib/access";

/**
 * Protect /api/* on deployments that require the shared access token.
 * Unlock via POST /api/access (httpOnly cookie) or Authorization: Bearer.
 *
 * On Vercel (or PACTRIEVE_ENFORCE_ACCESS_GATE), a missing token fails closed
 * instead of exposing service-role-backed document APIs.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isAccessRoute = path === "/api/access" || path.startsWith("/api/access/");

  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Always allow the unlock / status route so operators can diagnose misconfig.
  if (isAccessRoute) {
    return NextResponse.next();
  }

  if (accessGateMisconfigured()) {
    return NextResponse.json(
      {
        error:
          "Deployment access gate is misconfigured. Set PACTRIEVE_ACCESS_TOKEN on this host before serving APIs.",
        code: "ACCESS_GATE_MISCONFIGURED"
      },
      {status: 503, headers: {"Cache-Control": "no-store"}}
    );
  }

  const expected = configuredAccessToken();
  if (!expected) {
    // Local single-user (non-hosted): open APIs.
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
