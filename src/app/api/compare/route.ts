import {jsonError, jsonOk} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";
import {compareDocumentSources, compareRequestSchema} from "@/lib/compare";
import {enrichSignificances, mergeSignificances, rebuildOverview} from "@/lib/compare/significance";

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
  const enrich = parsed.data.enrich !== false;

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
    let result = compareDocumentSources({
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

    if (enrich) {
      const baseSigs = result.changes
        .map(c => c.significance)
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
      const enrichment = await enrichSignificances({
        result,
        significances: baseSigs,
        signal: request.signal
      });
      const overview = rebuildOverview(enrichment.significances, [
        ...result.coverage.notes,
        ...enrichment.notes
      ]);
      result = mergeSignificances(result, enrichment.significances, overview, {
        deterministicMs: result.analysisMetrics.deterministicMs,
        enrichMs: enrichment.enrichMs,
        enrichAttempted: enrichment.enrichAttempted,
        enrichSucceeded: enrichment.enrichSucceeded,
        enrichFailed: enrichment.enrichFailed
      });
    }

    return jsonOk(result);
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as {status: number}).status)
        : 500;
    if (status === 400 || status === 409) {
      return jsonError(error instanceof Error ? error.message : "Comparison failed.", status);
    }
    return jsonError("Comparison failed.", status || 500);
  }
}
