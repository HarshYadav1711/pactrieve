import {readFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

async function upload(env, path, name) {
  const buf = readFileSync(path);
  const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const initiated = await fetch("http://localhost:3000/api/documents/initiate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name, mimeType: mime, sizeBytes: buf.length})
  });
  const init = await initiated.json();
  if (!initiated.ok) throw new Error(JSON.stringify(init));
  const storage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {persistSession: false}
  }).storage;
  const {error} = await storage
    .from(init.bucket)
    .uploadToSignedUrl(init.uploadPath, init.uploadToken, buf, {contentType: mime});
  if (error) throw error;
  const proc = await fetch(`http://localhost:3000/api/documents/${init.documentId}/process`, {
    method: "POST"
  });
  const result = await proc.json();
  if (!proc.ok) throw new Error(JSON.stringify(result));
  console.log(name, init.documentId, "ready");
  return init.documentId;
}

const env = loadEnv();
const a = await upload(env, "fixtures/phase7-alpha.docx", "phase7-alpha.docx");
const b = await upload(env, "fixtures/phase7-beta.docx", "phase7-beta.docx");
console.log("PAIR", a, b);
