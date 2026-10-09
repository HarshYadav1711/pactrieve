import {NextResponse} from "next/server";
import {
  ACCESS_COOKIE,
  accessGateEnabled,
  configuredAccessToken,
  requestHasValidAccess,
  tokensEqual
} from "@/lib/access";
import {jsonError, jsonOk} from "@/lib/http";

export const runtime = "nodejs";

/** Whether the optional deployment access gate is enabled (does not reveal the token). */
export async function GET(request: Request) {
  const required = accessGateEnabled();
  if (!required) {
    return jsonOk({required: false, unlocked: true});
  }
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMatch = new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([^;]*)`).exec(cookieHeader);
  const unlocked = requestHasValidAccess({
    authorizationHeader: request.headers.get("authorization"),
    cookieValue: cookieMatch ? decodeURIComponent(cookieMatch[1]!) : null
  });
  return jsonOk({required: true, unlocked});
}

/**
 * Exchange a shared deployment passphrase for an httpOnly cookie.
 * Body: { "token": "..." }
 */
export async function POST(request: Request) {
  const expected = configuredAccessToken();
  if (!expected) {
    return jsonOk({required: false, unlocked: true});
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON.", 400);
  }
  const token =
    body && typeof body === "object" && "token" in body && typeof (body as {token: unknown}).token === "string"
      ? (body as {token: string}).token.trim()
      : "";
  if (!token || !tokensEqual(token, expected)) {
    return jsonError("Invalid access token.", 401);
  }

  const response = NextResponse.json(
    {required: true, unlocked: true},
    {status: 200, headers: {"Cache-Control": "no-store"}}
  );
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    // Only mark Secure on HTTPS; NODE_ENV=production on local http:// would drop the cookie.
    secure: cookieShouldBeSecure(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return response;
}

function cookieShouldBeSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Clear the access cookie (logout of the shared gate). */
export async function DELETE(request: Request) {
  const response = NextResponse.json(
    {required: accessGateEnabled(), unlocked: false},
    {status: 200, headers: {"Cache-Control": "no-store"}}
  );
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieShouldBeSecure(request),
    path: "/",
    maxAge: 0
  });
  return response;
}
