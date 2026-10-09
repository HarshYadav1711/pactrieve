/**
 * Deployment access gate (not multi-user auth).
 *
 * Local (non-Vercel): when PACTRIEVE_ACCESS_TOKEN is unset, APIs stay open for
 * single-user development.
 *
 * Hosted (VERCEL=1, or PACTRIEVE_ENFORCE_ACCESS_GATE=1): a missing token is a
 * misconfiguration — APIs fail closed instead of exposing service-role data.
 *
 * When the token is set, middleware requires Bearer or httpOnly cookie before
 * any /api route other than /api/access may proceed.
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

/**
 * True on Vercel (Production/Preview) or when explicitly enforcing the gate.
 * Used to fail closed if the shared token was forgotten on a public host.
 */
export function isHostedPublicSurface(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.VERCEL ?? "").trim() === "1") return true;
  const flag = (env.PACTRIEVE_ENFORCE_ACCESS_GATE ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/** Hosted without a token — must not silently open privileged APIs. */
export function accessGateMisconfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isHostedPublicSurface(env) && !accessGateEnabled(env);
}

export type AccessGateStatus = {
  required: boolean;
  unlocked: boolean;
  /** True when a public host is missing PACTRIEVE_ACCESS_TOKEN. */
  misconfigured: boolean;
};

export function describeAccessGate(env: NodeJS.ProcessEnv = process.env): Omit<AccessGateStatus, "unlocked"> {
  if (accessGateMisconfigured(env)) {
    return {required: true, misconfigured: true};
  }
  if (accessGateEnabled(env)) {
    return {required: true, misconfigured: false};
  }
  return {required: false, misconfigured: false};
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
