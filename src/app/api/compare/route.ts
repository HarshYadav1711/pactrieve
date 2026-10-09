import {jsonError, jsonOk} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";
import {compareDocumentSources, compareRequestSchema} from "@/lib/compare";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON.", 400);
  }

  const parsed = compareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid comparison request.", 400);
  }

  const {originalDocumentId, revisedDocumentId} = parsed.data;
  if (originalDocumentId === revisedDocumentId) {
    return jsonError("Cannot compare a document to itself. Choose distinct original and revised versions.", 400);
  }

  let originalData: Awaited<ReturnType<typeof getDocumentSource>>;
  let revisedData: Awaited<ReturnType<typeof getDocumentSource>>;
  try {
    [originalData, revisedData] = await Promise.all([
      getDocumentSource(originalDocumentId),
      getDocumentSource(revisedDocumentId)
    ]);
  } catch {
    return jsonError("Unable to load one or both documents.", 500);
  }

  if (!originalData) return jsonError("Original document not found.", 404);
  if (!revisedData) return jsonError("Revised document not found.", 404);

  if (originalData.document.status !== "ready") {
    return jsonError(
      `Original document "${originalData.document.name}" is not ready (status: ${originalData.document.status}).`,
      409
    );
  }
  if (revisedData.document.status !== "ready") {
    return jsonError(
      `Revised document "${revisedData.document.name}" is not ready (status: ${revisedData.document.status}).`,
      409
    );
  }

  try {
    const result = compareDocumentSources({
      original: {
        meta: {
          id: originalData.document.id,
          name: originalData.document.name,
          mimeType: originalData.document.mime_type,
          pageCount: originalData.document.page_count,
          unreadablePageCount: originalData.document.unreadable_page_count
        },
        source: originalData.source
      },
      revised: {
        meta: {
          id: revisedData.document.id,
          name: revisedData.document.name,
          mimeType: revisedData.document.mime_type,
          pageCount: revisedData.document.page_count,
          unreadablePageCount: revisedData.document.unreadable_page_count
        },
        source: revisedData.source
      }
    });
    return jsonOk(result);
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as {status: number}).status)
        : 500;
    return jsonError(error instanceof Error ? error.message : "Comparison failed.", status || 500);
  }
}
