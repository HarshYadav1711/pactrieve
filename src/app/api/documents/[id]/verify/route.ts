import {NextResponse} from "next/server";
import {z} from "zod";
import {isUuid, jsonError} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";
import {verifyQuote} from "@/lib/evidence/verify";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string}>};
const quoteSchema = z.object({quote: z.string().min(1).max(20000)});
export async function POST(request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.",400);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON.",400); }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return jsonError("Supply a quotation under 20,000 characters.",400);
  try {
    const data = await getDocumentSource(id);
    if (!data) return jsonError("Document not found.",404);
    if (data.document.status !== "ready") return jsonError("Document is not ready.",409);
    const result = verifyQuote(data.source,parsed.data.quote);
    return NextResponse.json({documentId: id,...result}, {headers: {"Cache-Control": "no-store"}});
  } catch { return jsonError("Evidence verification failed.",500); }
}
