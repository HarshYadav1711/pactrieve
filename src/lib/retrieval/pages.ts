import type {PageBoundary} from "../evidence/verify.ts";

export function pageIndicesForRange(pages: PageBoundary[], start: number, end: number): number[] {
  return pages
    .filter(page => page.start < end && page.end > start)
    .map(page => page.pageIndex);
}
