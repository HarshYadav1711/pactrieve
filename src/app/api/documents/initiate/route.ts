import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {uploadInputSchema} from "@/lib/documents/validate";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";
import {jsonError} from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return jsonError("Invalid JSON.", 400); }
  const parsed = uploadInputSchema.safeParse(payload);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid file.", 400);
  const {name, mimeType, sizeBytes} = parsed.data;
  const id = randomUUID();
  const ext = mimeType === "application/pdf" ? "pdf" : "docx";
  const path = `documents/${id}.${ext}`;
  try {
    const db = serverSupabase();
    const {data: upload, error: signingError} = await db.storage.from(storageBucket()).createSignedUploadUrl(path);
    if (signingError || !upload) throw signingError ?? new Error("Could not sign upload");
    const {error: insertError} = await db.from("documents").insert({
      id, name, mime_type: mimeType, size_bytes: sizeBytes, storage_path: path, status: "uploading"
    });
    if (insertError) throw insertError;
    return NextResponse.json({documentId: id, uploadPath: path, uploadToken: upload.token, bucket: storageBucket()});
  } catch {
    return jsonError("Unable to initialize upload. Check storage and database setup.", 500);
  }
}
