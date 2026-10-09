/**
 * Phase 8 live version comparison (requires app + Supabase).
 * Prefers phase7-alpha / phase7-beta when present.
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

const base = process.env.PHASE8_BASE_URL || "http://localhost:3000";
const docs = (await (await fetch(`${base}/api/documents`)).json()).documents.filter(d => d.status === "ready");
console.log(
  "ready:",
  docs.map(d => `${d.name} (${d.id.slice(0, 8)})`).join(", ")
);

const alpha = docs.find(d => /phase7-alpha/i.test(d.name));
const beta = docs.find(d => /phase7-beta/i.test(d.name));
if (!alpha || !beta) {
  console.error("Need phase7-alpha and phase7-beta uploaded.");
  process.exit(2);
}

const t0 = Date.now();
const res = await fetch(`${base}/api/compare`, {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    originalDocumentId: alpha.id,
    revisedDocumentId: beta.id
  })
});
const body = await res.json();
if (!res.ok) {
  console.error(body);
  process.exit(3);
}
console.log("ms", Date.now() - t0);
console.log("summary", body.summary);
console.log("metrics", body.metrics);
const mods = (body.changes || []).filter(c => c.kind === "modified" || c.kind === "moved");
for (const c of mods.slice(0, 6)) {
  console.log("-", c.kind, c.confidence, {
    o: (c.original?.text || "").slice(0, 80),
    r: (c.revised?.text || "").slice(0, 80)
  });
}
const joined = JSON.stringify(body.changes);
const okAmount = /100,000/.test(joined) && /1,000,000/.test(joined);
const okNotice = /30 days/.test(joined) && /60 days/.test(joined);
console.log("preserves amounts", okAmount, "preserves notice", okNotice);
process.exit(okAmount && okNotice && body.summary.modified + body.summary.moved >= 1 ? 0 : 4);
