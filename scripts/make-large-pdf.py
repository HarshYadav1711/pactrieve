"""Generate a synthetic ~150-page text PDF for Phase 1 ingestion timing."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "fixtures"
root.mkdir(exist_ok=True)
pages = 150
objs = []
objs.append("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
kids = " ".join(f"{3 + i * 2} 0 R" for i in range(pages))
objs.append(f"2 0 obj<< /Type /Pages /Kids [{kids}] /Count {pages} >>endobj\n")
# Font object number = 3 + pages*2
font_num = 3 + pages * 2
body = []
for i in range(pages):
    page_obj = 3 + i * 2
    content_obj = page_obj + 1
    text = f"Page {i + 1} of {pages}. Clause {i + 1}.1 Liability remains AED {(i + 1) * 1000}."
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET"
    body.append(
        f"{page_obj} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        f"/Contents {content_obj} 0 R /Resources<< /Font<< /F1 {font_num} 0 R >> >> >>endobj\n"
    )
    body.append(
        f"{content_obj} 0 obj<< /Length {len(stream)} >>stream\n{stream}\nendstream\nendobj\n"
    )
body.append(f"{font_num} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")

parts = ["%PDF-1.4\n"] + objs + body
# xref
pdf_so_far = "".join(parts).encode("latin1")
# rebuild with proper xref offsets by writing sequentially
out = bytearray(b"%PDF-1.4\n")
offsets = [0]
chunks = objs + body
for chunk in chunks:
    offsets.append(len(out))
    out.extend(chunk.encode("latin1"))
xref_pos = len(out)
out.extend(f"xref\n0 {len(offsets)}\n".encode("latin1"))
out.extend(b"0000000000 65535 f \n")
for off in offsets[1:]:
    out.extend(f"{off:010d} 00000 n \n".encode("latin1"))
out.extend(f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin1"))
path = root / "phase1-large-150.pdf"
path.write_bytes(out)
print(f"wrote {path.name} bytes={path.stat().st_size} pages={pages}")
