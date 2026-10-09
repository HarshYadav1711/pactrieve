import type {ChangeKind, ComparisonChange} from "../types.ts";
import type {ChangeSignal, DurationAmount, MoneyAmount} from "./types.ts";

const CURRENCY =
  "(?:AED|USD|EUR|GBP|CAD|AUD|CHF|JPY|INR|SGD|HKD|NZD|CNY|RMB|\\$)";

const MONEY_RE = new RegExp(
  `\\b(?:${CURRENCY})\\s*[\\d,]+(?:\\.\\d+)?|[\\d,]+(?:\\.\\d+)?\\s*(?:${CURRENCY})\\b`,
  "gi"
);

const DURATION_RE = /\b(\d+(?:\.\d+)?)\s*(days?|months?|years?)\b/gi;

const PERCENT_RE = /\b(\d+(?:\.\d+)?)\s*%|\b(\d+(?:\.\d+)?)\s*percent(?:age)?\b/gi;

const JURISDICTION_RE =
  /\b(?:governing\s+law|laws?\s+of|jurisdiction\s+of|courts?\s+of)\s+([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3})/g;

const PARTY_RE =
  /\b(Supplier|Customer|Buyer|Seller|Licensor|Licensee|Company|Contractor|Client|Vendor|Party\s+[AB]|Provider|Recipient)\b/gi;

const TOPIC_PATTERNS: {topic: string; re: RegExp}[] = [
  {topic: "indemnity", re: /\bindemnif(?:y|ies|ication|ied)\b/i},
  {topic: "liability", re: /\bliabilit(?:y|ies)\b|\bliability\s+cap\b|\baggregate\s+(?:cap|limit)\b/i},
  {topic: "termination", re: /\bterminat(?:e|es|ion|ing)\b|\bfor\s+convenience\b/i},
  {topic: "confidentiality", re: /\bconfidential(?:ity)?\b|\bnon[- ]disclosure\b/i},
  {topic: "intellectual_property", re: /\bintellectual\s+property\b|\bcopyright\b|\btrademark\b|\bpatent\b|\bwork\s+product\b/i},
  {topic: "assignment", re: /\bassign(?:ment|s|able)?\b/i},
  {topic: "insurance", re: /\binsurance\b|\binsured\b/i},
  {topic: "warranty", re: /\bwarrant(?:y|ies|s)\b/i},
  {topic: "payment", re: /\bpayment\b|\binvoice\b|\bfees?\b|\bconsideration\b/i},
  {topic: "exclusivity", re: /\bexclusiv(?:e|ity)\b|\bnon[- ]compete\b/i},
  {topic: "renewal", re: /\brenew(?:al|s|able)?\b|\bautomatic(?:ally)?\s+renew/i},
  {topic: "dispute_resolution", re: /\barbitration\b|\bmediation\b|\bdispute\s+resolution\b/i},
  {topic: "data_use", re: /\bpersonal\s+data\b|\bdata\s+(?:protection|processing|use)\b|\bGDPR\b/i}
];

const NEGATION_RE = /\b(?:shall\s+not|may\s+not|must\s+not|cannot|can\s+not|will\s+not|is\s+not\s+entitled|not\s+permitted)\b/i;
const MODAL_RE = /\b(shall|must|may|will|should)\b/gi;

export function parseMoney(raw: string): MoneyAmount {
  const currencyMatch = raw.match(new RegExp(CURRENCY, "i"));
  const currency = currencyMatch ? currencyMatch[0]!.toUpperCase().replace("$", "USD") : null;
  const numMatch = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  const value = numMatch ? Number(numMatch[1]) : null;
  return {raw: raw.trim(), currency, value: Number.isFinite(value) ? value : null};
}

export function extractMoneyAmounts(text: string): MoneyAmount[] {
  const out: MoneyAmount[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(MONEY_RE)) {
    const parsed = parseMoney(m[0]!);
    const key = `${parsed.currency ?? ""}:${parsed.value ?? parsed.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

export function extractDurations(text: string): DurationAmount[] {
  const out: DurationAmount[] = [];
  for (const m of text.matchAll(DURATION_RE)) {
    const count = Number(m[1]);
    if (!Number.isFinite(count)) continue;
    const unitRaw = m[2]!.toLowerCase();
    const unit: DurationAmount["unit"] = unitRaw.startsWith("day")
      ? "day"
      : unitRaw.startsWith("month")
        ? "month"
        : "year";
    const days = unit === "day" ? count : unit === "month" ? count * 30 : count * 365;
    out.push({raw: m[0]!, days, unit, count});
  }
  return out;
}

export function extractPercentages(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(PERCENT_RE)) {
    const n = Number(m[1] ?? m[2]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function extractTopics(text: string): string[] {
  return TOPIC_PATTERNS.filter(t => t.re.test(text)).map(t => t.topic);
}

export function extractParties(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(PARTY_RE)) {
    set.add(m[1]!.replace(/\s+/g, " "));
  }
  return [...set];
}

export function hasNegation(text: string): boolean {
  return NEGATION_RE.test(text);
}

export function extractModals(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(MODAL_RE)) set.add(m[1]!.toLowerCase());
  return [...set];
}

export function extractJurisdictions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(JURISDICTION_RE)) {
    if (m[1]) out.push(m[1].trim());
  }
  return out;
}

/**
 * Detect observable change signals between original and revised texts for a structural change.
 */
export function detectChangeSignals(change: ComparisonChange): ChangeSignal[] {
  const oText = change.original?.text ?? "";
  const rText = change.revised?.text ?? "";
  const signals: ChangeSignal[] = [];

  signals.push(...moneySignals(oText, rText, change.kind));
  signals.push(...durationSignals(oText, rText, change.kind));
  signals.push(...percentSignals(oText, rText));
  signals.push(...modalSignals(oText, rText));
  signals.push(...negationSignals(oText, rText));
  signals.push(...partySignals(oText, rText));
  signals.push(...jurisdictionSignals(oText, rText));
  signals.push(...topicSignals(oText, rText, change.kind));

  if (change.kind === "moved") {
    signals.push({
      kind: "structural",
      label: "relocation",
      detail: "Near-identical provision relocated or renumbered.",
      facts: {moved: true}
    });
  }

  return signals;
}

function moneySignals(oText: string, rText: string, kind: ChangeKind): ChangeSignal[] {
  const o = extractMoneyAmounts(oText);
  const r = extractMoneyAmounts(rText);
  if (!o.length && !r.length) return [];

  if (kind === "added" && r.length) {
    return r.map(m => ({
      kind: "monetary" as const,
      label: "monetary_amount",
      detail: `Revised text introduces amount ${m.raw}.`,
      facts: {
        originalRaw: null,
        revisedRaw: m.raw,
        originalValue: null,
        revisedValue: m.value,
        currency: m.currency,
        direction: "added"
      }
    }));
  }
  if (kind === "removed" && o.length) {
    return o.map(m => ({
      kind: "monetary" as const,
      label: "monetary_amount",
      detail: `Original text included amount ${m.raw} with no aligned revised counterpart.`,
      facts: {
        originalRaw: m.raw,
        revisedRaw: null,
        originalValue: m.value,
        revisedValue: null,
        currency: m.currency,
        direction: "removed"
      }
    }));
  }

  const signals: ChangeSignal[] = [];
  // Pair by currency when possible; otherwise by index for single amounts.
  const usedR = new Set<number>();
  for (const om of o) {
    let ri = r.findIndex((rm, i) => !usedR.has(i) && currenciesCompatible(om.currency, rm.currency));
    if (ri < 0 && o.length === 1 && r.length === 1) ri = 0;
    if (ri < 0) {
      signals.push({
        kind: "monetary",
        label: "monetary_amount",
        detail: `Original amount ${om.raw} has no clearly paired revised amount.`,
        facts: {
          originalRaw: om.raw,
          revisedRaw: null,
          originalValue: om.value,
          revisedValue: null,
          currency: om.currency,
          direction: "removed"
        }
      });
      continue;
    }
    usedR.add(ri);
    const rm = r[ri]!;
    if (om.currency && rm.currency && om.currency !== rm.currency) {
      signals.push({
        kind: "monetary",
        label: "currency_mismatch",
        detail: `Currency differs (${om.currency} vs ${rm.currency}). Amounts were not converted.`,
        facts: {
          originalRaw: om.raw,
          revisedRaw: rm.raw,
          originalValue: om.value,
          revisedValue: rm.value,
          currency: null,
          direction: "currency_mismatch"
        }
      });
      continue;
    }
    if (om.value != null && rm.value != null && om.value !== rm.value) {
      const direction = rm.value > om.value ? "increased" : "decreased";
      const ratio =
        om.value > 0 && Number.isFinite(rm.value / om.value)
          ? Math.round((rm.value / om.value) * 100) / 100
          : null;
      signals.push({
        kind: "monetary",
        label: "monetary_amount",
        detail: `Amount ${direction} from ${om.raw} to ${rm.raw}.`,
        facts: {
          originalRaw: om.raw,
          revisedRaw: rm.raw,
          originalValue: om.value,
          revisedValue: rm.value,
          currency: om.currency ?? rm.currency,
          direction,
          ratio
        }
      });
    } else if (normalizeMoneyKey(om) !== normalizeMoneyKey(rm)) {
      signals.push({
        kind: "monetary",
        label: "monetary_amount",
        detail: `Monetary wording changed from ${om.raw} to ${rm.raw}.`,
        facts: {
          originalRaw: om.raw,
          revisedRaw: rm.raw,
          originalValue: om.value,
          revisedValue: rm.value,
          currency: om.currency ?? rm.currency,
          direction: "changed"
        }
      });
    }
  }
  for (let i = 0; i < r.length; i++) {
    if (usedR.has(i)) continue;
    const rm = r[i]!;
    signals.push({
      kind: "monetary",
      label: "monetary_amount",
      detail: `Revised text introduces amount ${rm.raw}.`,
      facts: {
        originalRaw: null,
        revisedRaw: rm.raw,
        originalValue: null,
        revisedValue: rm.value,
        currency: rm.currency,
        direction: "added"
      }
    });
  }
  return signals;
}

function durationSignals(oText: string, rText: string, kind: ChangeKind): ChangeSignal[] {
  const o = extractDurations(oText);
  const r = extractDurations(rText);
  if (!o.length && !r.length) return [];

  if (kind === "added" && r.length) {
    return [
      {
        kind: "duration",
        label: "time_period",
        detail: `Revised text introduces period ${r[0]!.raw}.`,
        facts: {
          originalRaw: null,
          revisedRaw: r[0]!.raw,
          originalDays: null,
          revisedDays: r[0]!.days,
          direction: "added"
        }
      }
    ];
  }
  if (kind === "removed" && o.length) {
    return [
      {
        kind: "duration",
        label: "time_period",
        detail: `Original text included period ${o[0]!.raw} with no aligned revised counterpart.`,
        facts: {
          originalRaw: o[0]!.raw,
          revisedRaw: null,
          originalDays: o[0]!.days,
          revisedDays: null,
          direction: "removed"
        }
      }
    ];
  }

  if (o.length && r.length) {
    const od = o[0]!;
    const rd = r[0]!;
    if (od.days !== rd.days) {
      const direction = rd.days > od.days ? "increased" : "decreased";
      return [
        {
          kind: "duration",
          label: "time_period",
          detail: `Time period ${direction} from ${od.raw} to ${rd.raw}.`,
          facts: {
            originalRaw: od.raw,
            revisedRaw: rd.raw,
            originalDays: od.days,
            revisedDays: rd.days,
            direction
          }
        }
      ];
    }
  }
  return [];
}

function percentSignals(oText: string, rText: string): ChangeSignal[] {
  const o = extractPercentages(oText);
  const r = extractPercentages(rText);
  if (!o.length && !r.length) return [];
  if (o.length === 1 && r.length === 1 && o[0] !== r[0]) {
    return [
      {
        kind: "percentage",
        label: "percentage",
        detail: `Percentage changed from ${o[0]}% to ${r[0]}%.`,
        facts: {originalValue: o[0]!, revisedValue: r[0]!, direction: r[0]! > o[0]! ? "increased" : "decreased"}
      }
    ];
  }
  return [];
}

function modalSignals(oText: string, rText: string): ChangeSignal[] {
  if (!oText || !rText) return [];
  const o = extractModals(oText);
  const r = extractModals(rText);
  const oHasShall = o.includes("shall") || o.includes("must");
  const rHasShall = r.includes("shall") || r.includes("must");
  const oHasMay = o.includes("may");
  const rHasMay = r.includes("may");
  if (oHasShall && rHasMay && !rHasShall) {
    return [
      {
        kind: "modal",
        label: "obligation_to_discretion",
        detail: "Mandatory language (shall/must) changed toward discretionary language (may).",
        facts: {originalModal: "shall/must", revisedModal: "may"}
      }
    ];
  }
  if (oHasMay && !oHasShall && rHasShall && !rHasMay) {
    return [
      {
        kind: "modal",
        label: "discretion_to_obligation",
        detail: "Discretionary language (may) changed toward mandatory language (shall/must).",
        facts: {originalModal: "may", revisedModal: "shall/must"}
      }
    ];
  }
  return [];
}

function negationSignals(oText: string, rText: string): ChangeSignal[] {
  if (!oText || !rText) return [];
  const oNeg = hasNegation(oText);
  const rNeg = hasNegation(rText);
  if (oNeg === rNeg) return [];
  if (!oNeg && rNeg) {
    return [
      {
        kind: "negation",
        label: "negation_introduced",
        detail: "Revised text introduces a prohibition or negation not present in the original.",
        facts: {introduced: true, removed: false}
      }
    ];
  }
  return [
    {
      kind: "negation",
      label: "negation_removed",
      detail: "Revised text removes a prohibition or negation that was present in the original.",
      facts: {introduced: false, removed: true}
    }
  ];
}

function partySignals(oText: string, rText: string): ChangeSignal[] {
  if (!oText || !rText) return [];
  const o = extractParties(oText).map(p => p.toLowerCase()).sort();
  const r = extractParties(rText).map(p => p.toLowerCase()).sort();
  if (!o.length || !r.length) return [];
  if (o.join("|") === r.join("|")) return [];
  // Only flag when a clear role swap of primary actor appears in short clauses.
  if (o.length <= 2 && r.length <= 2) {
    return [
      {
        kind: "party",
        label: "obligated_party",
        detail: `Named party roles differ (${o.join(", ") || "—"} → ${r.join(", ") || "—"}).`,
        facts: {originalParties: o.join(", "), revisedParties: r.join(", ")}
      }
    ];
  }
  return [];
}

function jurisdictionSignals(oText: string, rText: string): ChangeSignal[] {
  const o = extractJurisdictions(oText);
  const r = extractJurisdictions(rText);
  if (!o.length && !r.length) return [];
  if (o.join("|").toLowerCase() === r.join("|").toLowerCase()) return [];
  return [
    {
      kind: "jurisdiction",
      label: "governing_law",
      detail: `Governing law / jurisdiction wording differs (${o[0] ?? "—"} → ${r[0] ?? "—"}).`,
      facts: {original: o[0] ?? null, revised: r[0] ?? null}
    }
  ];
}

function topicSignals(oText: string, rText: string, kind: ChangeKind): ChangeSignal[] {
  const oTopics = new Set(extractTopics(oText));
  const rTopics = new Set(extractTopics(rText));
  const signals: ChangeSignal[] = [];
  if (kind === "added") {
    for (const t of rTopics) {
      signals.push({
        kind: "topic",
        label: t,
        detail: `Added provision relates to ${t.replace(/_/g, " ")}.`,
        facts: {topic: t, presence: "added"}
      });
    }
  } else if (kind === "removed") {
    for (const t of oTopics) {
      signals.push({
        kind: "topic",
        label: t,
        detail: `Removed provision related to ${t.replace(/_/g, " ")}.`,
        facts: {topic: t, presence: "removed"}
      });
    }
  } else {
    for (const t of [...oTopics, ...rTopics]) {
      if (oTopics.has(t) || rTopics.has(t)) {
        // Only emit when topics are involved in a modified clause
        if (oTopics.has(t) && rTopics.has(t)) {
          signals.push({
            kind: "topic",
            label: t,
            detail: `Change involves ${t.replace(/_/g, " ")} language.`,
            facts: {topic: t, presence: "both"}
          });
        } else if (rTopics.has(t) && !oTopics.has(t)) {
          signals.push({
            kind: "topic",
            label: t,
            detail: `Revised text introduces ${t.replace(/_/g, " ")} language.`,
            facts: {topic: t, presence: "added"}
          });
        } else {
          signals.push({
            kind: "topic",
            label: t,
            detail: `Revised text no longer includes ${t.replace(/_/g, " ")} language found in the original.`,
            facts: {topic: t, presence: "removed"}
          });
        }
      }
    }
  }
  // Dedupe by topic label
  const seen = new Set<string>();
  return signals.filter(s => {
    if (seen.has(s.label)) return false;
    seen.add(s.label);
    return true;
  });
}

function currenciesCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  return a === b;
}

function normalizeMoneyKey(m: MoneyAmount): string {
  return `${m.currency ?? ""}:${m.value ?? m.raw.toLowerCase()}`;
}
