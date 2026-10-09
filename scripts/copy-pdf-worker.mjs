/** Copy the PDF.js worker into /public for same-origin loading (no CDN). */
import {copyFileSync, existsSync, mkdirSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = resolve(root, "public");
const dest = resolve(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("copy-pdf-worker: pdfjs-dist worker not found — skip");
  process.exit(0);
}
mkdirSync(destDir, {recursive: true});
copyFileSync(src, dest);
console.log("copy-pdf-worker: wrote public/pdf.worker.min.mjs");
