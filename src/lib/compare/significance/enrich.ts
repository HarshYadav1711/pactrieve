import {loadLlmConfig} from "../../llm/config.ts";
import type {ComparisonChange, ComparisonResult} from "../types.ts";
import {
  llmEnrichmentBatchSchema,
  type ChangeSignificance,
  type LlmEnrichmentItem
} from "./types.ts";

const MAX_ENRICH_CHANGES = 8;
const MAX_BATCHES = 2;
const MAX_CLAUSE_CHARS = 1_200;
const ENRICH_TIMEOUT_MS = 25_000;

export interface EnrichResult {
  significances: ChangeSignificance[];
  enrichMs: number;
  enrichAttempted: boolean;
  enrichSucceeded: number;
  enrichFailed: number;
  notes: string[];
}

/**
 * Optional grounded LLM enrichment. Structural pairing and source offsets stay server-derived.
 * Falls back silently to deterministic text when config/provider/validation fails.
 */
export async function enrichSignificances(input: {
  result: ComparisonResult;
  significances: ChangeSignificance[];
  signal?: AbortSignal;
}): Promise<EnrichResult> {
  const t0 = Date.now();
  const notes: string[] = [];
  const config = loadLlmConfig();
  if (!config.ok) {
    return {
      significances: input.significances,
      enrichMs: Date.now() - t0,
      enrichAttempted: false,
      enrichSucceeded: 0,
      enrichFailed: 0,
      notes: ["LLM enrichment skipped: provider not configured. Deterministic analysis retained."]
    };
  }

  const byId = new Map(input.result.changes.map(c => [c.id, c]));
  const candidates = input.significances.filter(s => {
    if (s.changeType === "unchanged" || s.changeType === "moved") return false;
    if (s.severity === "low" && s.changeType !== "modified") return false;
    return s.significanceStatus === "analyzed" || s.severity === "review_needed";
  });

  // Prefer high/medium first, stable by changeId.
  candidates.sort((a, b) => {
    const rank = (s: ChangeSignificance) =>
      s.severity === "high" ? 0 : s.severity === "review_needed" ? 1 : s.severity === "medium" ? 2 : 3;
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.changeId.localeCompare(b.changeId);
  });

  const selected = candidates.slice(0, MAX_ENRICH_CHANGES);
  if (!selected.length) {
    return {
      significances: input.significances,
      enrichMs: Date.now() - t0,
      enrichAttempted: false,
      enrichSucceeded: 0,
      enrichFailed: 0,
      notes: ["LLM enrichment skipped: no eligible substantive changes."]
    };
  }

  let enrichSucceeded = 0;
  let enrichFailed = 0;
  const updated = new Map(input.significances.map(s => [s.changeId, s]));

  const batches: ChangeSignificance[][] = [];
  for (let i = 0; i < selected.length && batches.length < MAX_BATCHES; i += 4) {
    batches.push(selected.slice(i, i + 4));
  }

  for (const batch of batches) {
    try {
      const items = await requestEnrichmentBatch({
        apiKey: config.config.apiKey,
        baseUrl: config.config.baseUrl,
        model: config.config.model,
        batch,
        byId,
        signal: input.signal
      });
      for (const item of items) {
        const current = updated.get(item.changeId);
        const change = byId.get(item.changeId);
        if (!current || !change) {
          enrichFailed += 1;
          continue;
        }
        const grounded = groundEnrichment(item, current, change);
        if (!grounded.ok) {
          enrichFailed += 1;
          notes.push(`LLM enrichment rejected for ${item.changeId}: ${grounded.reason}`);
          continue;
        }
        updated.set(item.changeId, grounded.significance);
        enrichSucceeded += 1;
      }
    } catch (error) {
      enrichFailed += batch.length;
      notes.push(
        `LLM enrichment batch failed: ${error instanceof Error ? error.message : "provider error"}. Deterministic text retained.`
      );
    }
  }

  if (enrichSucceeded === 0 && enrichFailed > 0) {
    notes.push("All LLM enrichment attempts failed or were rejected; deterministic analysis retained.");
  } else if (enrichSucceeded > 0) {
    notes.push(
      `LLM enrichment applied to ${enrichSucceeded} change(s); factual amounts/parties validated against source text.`
    );
  }

  return {
    significances: input.significances.map(s => updated.get(s.changeId) ?? s),
    enrichMs: Date.now() - t0,
    enrichAttempted: true,
    enrichSucceeded,
    enrichFailed,
    notes
  };
}

async function requestEnrichmentBatch(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  batch: ChangeSignificance[];
  byId: Map<string, ComparisonChange>;
  signal?: AbortSignal;
}): Promise<LlmEnrichmentItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener("abort", onAbort, {once: true});
  }

  const payload = {
    changes: input.batch.map(sig => {
      const change = input.byId.get(sig.changeId)!;
      return {
        changeId: sig.changeId,
        changeType: sig.changeType,
        severityHint: sig.severity,
        deterministicSummary: sig.summary,
        signals: sig.changeSignals.map(s => ({
          kind: s.kind,
          label: s.label,
          detail: s.detail,
          facts: s.facts
        })),
        originalText: truncate(change.original?.text ?? "", MAX_CLAUSE_CHARS),
        revisedText: truncate(change.revised?.text ?? "", MAX_CLAUSE_CHARS),
        originalSection: change.original?.sectionLabel ?? null,
        revisedSection: change.revised?.sectionLabel ?? null
      };
    })
  };

  try {
    const response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content:
              "You assist contract reviewers. Explain textual differences between ORIGINAL and REVISED clauses. " +
              "Be party-neutral. Do not invent penalties, court outcomes, intentions, or unstated exceptions. " +
              "Never invent or change document IDs, offsets, or page numbers. " +
              "Preserve exact monetary amounts, durations, and party names from the supplied text. " +
              "Respond with ONLY a JSON object (no markdown): " +
              "{\"items\":[{\"changeId\":\"c0\",\"summary\":\"...\",\"practicalEffect\":\"...\",\"reviewReasons\":[],\"suggestedSeverity\":\"high\",\"uncertainty\":null}]}"
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200).replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const body = (await response.json()) as {
      choices?: {message?: {content?: string}}[];
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsedJson = coerceEnrichmentJson(content);
    const validated = llmEnrichmentBatchSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new Error("Malformed enrichment JSON.");
    }
    return validated.data.items;
  } finally {
    clearTimeout(timeout);
    if (input.signal) input.signal.removeEventListener("abort", onAbort);
  }
}

function groundEnrichment(
  item: LlmEnrichmentItem,
  current: ChangeSignificance,
  change: ComparisonChange
): {ok: true; significance: ChangeSignificance} | {ok: false; reason: string} {
  const oText = change.original?.text ?? "";
  const rText = change.revised?.text ?? "";
  const combined = `${item.summary}\n${item.practicalEffect ?? ""}\n${(item.reviewReasons ?? []).join("\n")}`;

  // Reject if model swaps known monetary values.
  for (const signal of current.changeSignals) {
    if (signal.kind !== "monetary") continue;
    const oRaw = signal.facts.originalRaw;
    const rRaw = signal.facts.revisedRaw;
    if (typeof oRaw === "string" && typeof rRaw === "string") {
      const oNorm = normalizeAmountToken(oRaw);
      const rNorm = normalizeAmountToken(rRaw);
      // If summary mentions both amounts, ensure direction wording is not reversed:
      // require original amount appears before revised when describing an increase/decrease
      // OR at least both appear and no claim that original equals revised.
      if (!textContainsAmount(oText + rText, oRaw) && oText) {
        return {ok: false, reason: "original amount missing from source"};
      }
      if (!textContainsAmount(oText + rText, rRaw) && rText) {
        return {ok: false, reason: "revised amount missing from source"};
      }
      if (combined.includes(oNorm) && combined.includes(rNorm)) {
        // Detect obvious swap phrases: "from REVISED to ORIGINAL"
        const fromTo = combined.match(/from\s+([^\s,]+(?:\s*[^\s,]+)?)\s+to\s+([^\s,.]+)/i);
        if (fromTo) {
          const from = normalizeAmountToken(fromTo[1]!);
          const to = normalizeAmountToken(fromTo[2]!);
          if (from.includes(rNorm) && to.includes(oNorm)) {
            return {ok: false, reason: "original/revised amount direction appears reversed"};
          }
        }
      }
      // Model must not invent a third distinct major amount not in sources
    }
  }

  // Reject invented large currencies not present in either clause.
  const invented = combined.match(/\b(?:AED|USD|EUR|GBP)\s*[\d,]+(?:\.\d+)?/gi) ?? [];
  for (const amt of invented) {
    if (!textContainsAmount(oText, amt) && !textContainsAmount(rText, amt)) {
      return {ok: false, reason: `unsupported amount ${amt}`};
    }
  }

  // Do not allow model to escalate moved/unchanged (already filtered) or force high without signals.
  let severity = current.severity;
  if (item.suggestedSeverity === "review_needed") {
    severity = "review_needed";
  } else if (item.suggestedSeverity && severity !== "review_needed") {
    // Allow only same or more conservative (lower) severity from model; never escalate past deterministic high already set.
    // Escalation from low→high is blocked unless deterministic already medium/high.
    const order = ["low", "medium", "high", "review_needed"] as const;
    const suggested = item.suggestedSeverity;
    if (order.indexOf(suggested) > order.indexOf(severity) && severity === "low") {
      // ignore escalation from low
    } else if (order.indexOf(suggested) >= order.indexOf(severity)) {
      // allow same or if deterministic already medium and model says high with monetary/negation signals
      if (
        suggested === "high" &&
        current.changeSignals.some(s =>
          ["monetary", "negation", "modal", "jurisdiction", "topic"].includes(s.kind)
        )
      ) {
        severity = "high";
      }
    } else {
      severity = suggested;
    }
  }

  const reviewReasons = [
    ...current.reviewReasons,
    ...(item.reviewReasons ?? []),
    ...(item.uncertainty ? [item.uncertainty] : [])
  ].filter((v, i, a) => a.indexOf(v) === i);

  return {
    ok: true,
    significance: {
      ...current,
      summary: item.summary.trim(),
      practicalEffect: item.practicalEffect?.trim() || current.practicalEffect,
      severity,
      reviewReasons,
      significanceStatus: severity === "review_needed" ? "review_needed" : "analyzed",
      analysisMethod: "deterministic+llm",
      confidence: current.confidence
    }
  };
}

function textContainsAmount(text: string, raw: string): boolean {
  const compact = text.replace(/[\s,]/g, "").toLowerCase();
  const token = raw.replace(/[\s,]/g, "").toLowerCase();
  return compact.includes(token);
}

function normalizeAmountToken(raw: string): string {
  return raw.replace(/[\s,]/g, "").toLowerCase();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function coerceEnrichmentJson(content: string): unknown {
  let trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const startObj = trimmed.indexOf("{");
  const startArr = trimmed.indexOf("[");
  let slice = trimmed;
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) {
    const end = trimmed.lastIndexOf("}");
    if (end > startObj) slice = trimmed.slice(startObj, end + 1);
  } else if (startArr >= 0) {
    const end = trimmed.lastIndexOf("]");
    if (end > startArr) slice = trimmed.slice(startArr, end + 1);
  }
  const parsed = JSON.parse(slice) as unknown;
  if (Array.isArray(parsed)) return {items: parsed};
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as {items?: unknown}).items)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object" && "changeId" in (parsed as object)) {
    return {items: [parsed]};
  }
  throw new Error("No enrichment items in model response.");
}
