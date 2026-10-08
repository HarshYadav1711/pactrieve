import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string}>};
export async function GET(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.",400);
  try {
    const data = await getDocumentSource(id);
    if (!data) return jsonError("Document not found.",404);
    if (data.document.status !== "ready") return jsonError("Document is not ready for analysis.",409);
    return NextResponse.json({document: data.document, source: data.source},
      {headers: {"Cache-Control": "no-store"}});
  } catch { return jsonError("Unable to load extracted text.",500); }
}
