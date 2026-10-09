/**
 * Phase 9 live significance on version compare (requires app + Supabase).
 */
import {readFileSync} from "node:fs";

const root = new URL("..", import.meta.url);
try {
  for (const line of readFileSync(new URL(".env.local", root), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  /* optional */
}

const base = process.env.PHASE9_BASE_URL || "http://localhost:3000";
const docs = (await (await fetch(`${base}/api/documents`)).json()).documents.filter(d => d.status === "ready");
const alpha = docs.find(d => /phase7-alpha/i.test(d.name));
const beta = docs.find(d => /phase7-beta/i.test(d.name));
if (!alpha || !beta) {
  console.error("Need phase7-alpha and phase7-beta.");
  process.exit(2);
}

const t0 = Date.now();
const res = await fetch(`${base}/api/compare`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    originalDocumentId: alpha.id,
    revisedDocumentId: beta.id,
    enrich: true
  })
});
const body = await res.json();
if (!res.ok) {
  console.error(body);
  process.exit(3);
}
console.log("ms", Date.now() - t0);
console.log("summary", body.summary);
console.log("overview", body.overview);
console.log("analysisMetrics", body.analysisMetrics);

const mods = (body.changes || []).filter(c => c.kind === "modified");
for (const c of mods) {
  console.log("-", c.id, c.significance?.severity, c.significance?.summary, c.significance?.analysisMethod);
}

const joined = JSON.stringify(mods);
const okAmount =
  /100,000/.test(joined) &&
  /1,000,000/.test(joined) &&
  mods.some(c => c.significance?.severity === "high" && /increased/i.test(c.significance?.summary ?? ""));
const okNotice =
  /30 days/.test(joined) &&
  /60 days/.test(joined) &&
  mods.some(c => /30 days/.test(c.significance?.summary ?? "") && /60 days/.test(c.significance?.summary ?? ""));
const noSwap = !mods.some(c => /from\s+AED 1,000,000\s+to\s+AED 100,000/i.test(c.significance?.summary ?? ""));

console.log("liability", okAmount, "notice", okNotice, "noSwap", noSwap);
process.exit(okAmount && okNotice && noSwap ? 0 : 4);
