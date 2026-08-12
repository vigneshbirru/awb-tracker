"""
One-time helper: extract AWB numbers from your PDF into data/awbs.txt
(one AWB per line), which the Node worker reads.

Usage:
    pip install pdfplumber --break-system-packages
    python3 extract_awbs_from_pdf.py path/to/orders.pdf

Adjust AWB_PATTERN below if your AWB numbers don't match "12-digit number".
"""
import re
import sys
from pathlib import Path

AWB_PATTERN = re.compile(r"\b\d{12}\b")  # e.g. 500613053012 — tweak if needed

def extract(pdf_path: str, out_path: str = "data/awbs.txt"):
    import pdfplumber

    awbs = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            awbs.extend(AWB_PATTERN.findall(text))

            # If AWBs are in a table rather than free text, try table extraction too.
            for table in page.extract_tables():
                for row in table:
                    for cell in row:
                        if cell and AWB_PATTERN.fullmatch(cell.strip()):
                            awbs.append(cell.strip())

    unique_awbs = sorted(set(awbs))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text("\n".join(unique_awbs) + "\n", encoding="utf-8")
    print(f"Extracted {len(unique_awbs)} unique AWB numbers -> {out_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 extract_awbs_from_pdf.py path/to/orders.pdf")
        sys.exit(1)
    extract(sys.argv[1])
