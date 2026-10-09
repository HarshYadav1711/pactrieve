import JSZip from "jszip";

/** Minimal OOXML DOCX builder for deterministic Phase 6 fixtures. */
export async function buildDocxFixture(bodyXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.folder("_rels")!.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.folder("word")!.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr/>
  </w:body>
</w:document>`
  );
  const out = await zip.generateAsync({type: "nodebuffer"});
  return Buffer.from(out);
}

export function p(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function pRuns(runs: {text: string; bold?: boolean; italic?: boolean}[]): string {
  const parts = runs
    .map(run => {
      const rPr =
        run.bold || run.italic
          ? `<w:rPr>${run.bold ? "<w:b/>" : ""}${run.italic ? "<w:i/>" : ""}</w:rPr>`
          : "";
      return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
    })
    .join("");
  return `<w:p>${parts}</w:p>`;
}

export function heading(text: string, level = 1): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function table(rows: string[][]): string {
  const tr = rows
    .map(
      cells =>
        `<w:tr>${cells
          .map(c => `<w:tc><w:p><w:r><w:t>${escapeXml(c)}</w:t></w:r></w:p></w:tc>`)
          .join("")}</w:tr>`
    )
    .join("");
  return `<w:tbl>${tr}</w:tbl>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
