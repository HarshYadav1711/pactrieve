from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import io

root = Path(__file__).resolve().parents[1] / "fixtures"
root.mkdir(exist_ok=True)

pdf = b"""%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 24 Tf 100 700 Td (Phase1 Liability Cap AED 100,000.) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000384 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
456
%%EOF"""
(root / "phase1-sample.pdf").write_bytes(pdf)

scanned = b"""%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< >> >>endobj
4 0 obj<< /Length 0 >>stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
trailer<< /Size 5 /Root 1 0 R >>
startxref
293
%%EOF"""
(root / "phase1-scanned.pdf").write_bytes(scanned)

(root / "phase1-fake.pdf").write_text("not a pdf", encoding="utf-8")
(root / "phase1-empty.pdf").write_bytes(b"")

buf = io.BytesIO()
with ZipFile(buf, "w") as z:
    z.writestr("readme.txt", "not a docx")
(root / "phase1-fake.docx").write_bytes(buf.getvalue())

content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
document = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Phase1 DOCX Termination requires 30 days written notice.</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Liability</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>AED 100,000</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>Cafe terms apply. Party agrees to pay </w:t></w:r><w:r><w:t>INR 5,000.</w:t></w:r></w:p>
  </w:body>
</w:document>"""
with ZipFile(root / "phase1-sample.docx", "w", ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document)

# Multi-page PDF for partial-unreadable: page1 text, page2 empty
multipage = b"""%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 55 >>stream
BT /F1 18 Tf 72 720 Td (Readable page one clause.) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
6 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources<< >> >>endobj
7 0 obj<< /Length 0 >>stream
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000123 00000 n 
0000000274 00000 n 
0000000380 00000 n 
0000000449 00000 n 
0000000556 00000 n 
trailer<< /Size 8 /Root 1 0 R >>
startxref
605
%%EOF"""
(root / "phase1-partial.pdf").write_bytes(multipage)

print("wrote", sorted(p.name for p in root.iterdir()))
