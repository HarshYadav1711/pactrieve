/**
 * Server-only LLM configuration. Never expose these as NEXT_PUBLIC_*.
 */

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Request timeout in ms for the full generation call. */
  timeoutMs: number;
  /** Soft max completion tokens requested from the provider. */
  maxTokens: number;
}

export type LlmConfigError = {
  ok: false;
  code: "LLM_CONFIG_MISSING";
  message: string;
  missing: string[];
};

export type LlmConfigResult = {ok: true; config: LlmConfig} | LlmConfigError;

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 1024;

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

/** Normalize OpenAI-compatible base URL to end without a trailing slash. */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfigResult {
  const missing: string[] = [];
  const apiKey = (env.LLM_API_KEY ?? "").trim();
  const baseUrl = (env.LLM_BASE_URL ?? "").trim();
  const model = (env.LLM_MODEL ?? "").trim();
  if (!apiKey) missing.push("LLM_API_KEY");
  if (!baseUrl) missing.push("LLM_BASE_URL");
  if (!model) missing.push("LLM_MODEL");
  if (missing.length) {
    return {
      ok: false,
      code: "LLM_CONFIG_MISSING",
      message:
        `LLM provider is not configured. Set ${missing.join(", ")} in the server environment ` +
        `(OpenAI-compatible API). Do not expose these as NEXT_PUBLIC_ variables.`,
      missing
    };
  }
  const timeoutRaw = Number((env.LLM_TIMEOUT_MS ?? "").trim() || DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 5_000 && timeoutRaw <= 120_000
    ? timeoutRaw
    : DEFAULT_TIMEOUT_MS;
  const maxTokensRaw = Number((env.LLM_MAX_TOKENS ?? "").trim() || DEFAULT_MAX_TOKENS);
  const maxTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw >= 64 && maxTokensRaw <= 4096
    ? maxTokensRaw
    : DEFAULT_MAX_TOKENS;
  return {
    ok: true,
    config: {
      apiKey,
      baseUrl: normalizeBaseUrl(baseUrl),
      model,
      timeoutMs,
      maxTokens
    }
  };
}

/** Convenience for optional helpers that only need presence checks. */
export function peekLlmEnv(): {configured: boolean; missing: string[]} {
  const missing: string[] = [];
  if (!readEnv("LLM_API_KEY")) missing.push("LLM_API_KEY");
  if (!readEnv("LLM_BASE_URL")) missing.push("LLM_BASE_URL");
  if (!readEnv("LLM_MODEL")) missing.push("LLM_MODEL");
  return {configured: missing.length === 0, missing};
}
