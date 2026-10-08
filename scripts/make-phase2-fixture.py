"""Build a denser synthetic ~150-page contract text (+ simple PDF) for Phase 2 retrieval tests."""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "fixtures"
root.mkdir(exist_ok=True)

paras = []
paras.append("MASTER SERVICES AGREEMENT\n")
paras.append("This Master Services Agreement is entered into for synthetic evaluation only.\n")

# Page-oriented blocks (~45 lines each approximated by blank page markers later)
def clause(num, title, body):
    return f"{num} {title}\n{body}\n"

# Early clauses (pages 1-ish)
paras.append(clause("1.", "DEFINITIONS AND INTERPRETATION",
    'In this Agreement, "Confidential Information" means non-public business information. '
    '"Affiliate" means any entity controlling or controlled by a Party. '
    "Interpretation headings are for convenience only and do not affect meaning."))
paras.append(clause("1.1", "Priority",
    "If there is a conflict between schedules and the body, the body prevails unless a schedule expressly states otherwise."))

# Page ~30 marker content will be placed by page builder
special = {
    1: ("2.", "CONFIDENTIALITY",
        "Each Party shall keep Confidential Information confidential and shall not disclose it except to personnel with a need to know. "
        "The obligations survive for three years after termination."),
    30: ("8.", "LIMITATION OF LIABILITY",
         "Subject to Clause 8.2, the Supplier's aggregate liability shall not exceed AED 100,000. "
         "Nothing in this Agreement excludes liability for fraud or willful misconduct."),
    31: ("8.2", "Exceptions to Limitation",
         "The cap in Clause 8.1 does not apply to confidentiality breaches under Clause 2 or indemnities under Clause 11."),
    75: ("12.", "TERMINATION",
         "Either Party may terminate for convenience by giving 30 days written notice. "
         "Termination for material breach requires 15 days cure notice where the breach is remediable."),
    76: ("12.4", "Effect of Termination",
         "Upon termination, accrued payment obligations survive. Clauses 2, 8, 11 and 15 survive termination."),
    140: ("15.", "GOVERNING LAW",
          "This Agreement is governed by the laws of England and Wales. Courts of England have exclusive jurisdiction."),
    141: ("15.2", "Dispute Escalation",
          "Before litigation, senior representatives must meet within 14 days of a written dispute notice."),
    150: ("18.", "GENERAL",
          "This Agreement constitutes the entire agreement. Amendments must be in writing and signed. "
          "A person who is not a party has no rights under the Contracts (Rights of Third Parties) Act 1999."),
}

# Distractors with similar money / days
distractors = [
    (40, "9.", "FEES", "Fees are AED 1,000,000 per year exclusive of tax unless stated otherwise."),
    (50, "10.", "SERVICE LEVELS", "Critical incidents require a response within 60 days for root-cause reports."),
    (90, "11.", "INDEMNITY", "The Supplier shall indemnify the Customer against third-party IP claims, except to the extent caused by Customer materials."),
    (91, "11.2", "Indemnity Procedure", "The indemnified Party must give prompt notice and allow control of the defence."),
    (110, "13.", "FORCE MAJEURE", "Neither Party is liable for delays caused by events beyond reasonable control lasting more than 30 days."),
]

pages = []
for page in range(1, 151):
    blocks = [f"[PAGE {page}]", f"Page {page} of 150 — Synthetic evaluation contract."]
    if page in special:
        num, title, body = special[page]
        blocks.append(clause(num, title, body))
    for p, num, title, body in distractors:
        if p == page:
            blocks.append(clause(num, title, body))
    # Pad with dense filler that must NOT look like numbered operative clauses.
    for i in range(1, 8):
        blocks.append(
            f"Note {i}. The Parties acknowledge routine cooperation, reporting calendars, "
            f"and administrative correspondence on page {page}. This filler does not alter Clauses 2, 8, 12 or 15. "
            f"Reference values on this page are non-operative: amount REF-{page * 10}, notice window {page} hours."
        )
    pages.append("\n".join(blocks))

text = "\n\n".join(pages)
text_path = root / "phase2-contract-150.txt"
text_path.write_text(text, encoding="utf-8", newline="\n")
print(f"wrote {text_path.name} chars={len(text)} pages=150")

# Minimal multi-page PDF using one content stream per page (Helvetica), for live upload tests.
# Keep streams short enough for packaging but denser than Phase 1 sparse fixture.
font_num = 3 + 150 * 2
objs = []
objs.append("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
kids = " ".join(f"{3 + i * 2} 0 R" for i in range(150))
objs.append(f"2 0 obj<< /Type /Pages /Kids [{kids}] /Count 150 >>endobj\n")
body = []
for i in range(150):
    page_no = i + 1
    page_obj = 3 + i * 2
    content_obj = page_obj + 1
    # Pull a short excerpt for PDF text layer
    excerpt = pages[i].replace("(", "[").replace(")", "]")
    excerpt = " ".join(excerpt.split())[:220]
    stream = f"BT /F1 10 Tf 40 750 Td ({excerpt}) Tj ET"
    body.append(
        f"{page_obj} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        f"/Contents {content_obj} 0 R /Resources<< /Font<< /F1 {font_num} 0 R >> >> >>endobj\n"
    )
    body.append(
        f"{content_obj} 0 obj<< /Length {len(stream)} >>stream\n{stream}\nendstream\nendobj\n"
    )
body.append(f"{font_num} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")

out = bytearray(b"%PDF-1.4\n")
offsets = [0]
for chunk in objs + body:
    offsets.append(len(out))
    out.extend(chunk.encode("latin1", errors="replace"))
xref_pos = len(out)
out.extend(f"xref\n0 {len(offsets)}\n".encode("latin1"))
out.extend(b"0000000000 65535 f \n")
for off in offsets[1:]:
    out.extend(f"{off:010d} 00000 n \n".encode("latin1"))
out.extend(
    f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin1")
)
pdf_path = root / "phase2-contract-150.pdf"
pdf_path.write_bytes(out)
print(f"wrote {pdf_path.name} bytes={pdf_path.stat().st_size}")
