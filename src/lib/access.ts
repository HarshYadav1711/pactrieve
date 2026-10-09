/**
 * Optional deployment access gate (not multi-user auth).
 *
 * When PACTRIEVE_ACCESS_TOKEN is unset, APIs remain open (local single-user).
 * When set, middleware requires a matching Bearer token or httpOnly cookie
 * before any /api route other than /api/access may proceed.
 *
 * This does not create accounts. It is a shared demo passphrase for public hosts.
 */

export const ACCESS_COOKIE = "pactrieve_access";
export const ACCESS_HEADER = "authorization";

export function configuredAccessToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = (env.PACTRIEVE_ACCESS_TOKEN ?? "").trim();
  return value.length > 0 ? value : null;
}

export function accessGateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return configuredAccessToken(env) !== null;
}

/** Constant-time string equality for tokens of known length. */
export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1]!.trim();
  return token.length ? token : null;
}

export function requestHasValidAccess(input: {
  authorizationHeader: string | null;
  cookieValue: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const expected = configuredAccessToken(input.env);
  if (!expected) return true;
  const bearer = extractBearerToken(input.authorizationHeader);
  if (bearer && tokensEqual(bearer, expected)) return true;
  const cookie = (input.cookieValue ?? "").trim();
  if (cookie && tokensEqual(cookie, expected)) return true;
  return false;
}

/** Safe public error helper — never echo raw provider/DB/stack strings. */
export function publicServerError(fallback: string, error?: unknown): string {
  if (error && typeof error === "object" && "publicMessage" in error) {
    const msg = (error as {publicMessage?: unknown}).publicMessage;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return fallback;
}
