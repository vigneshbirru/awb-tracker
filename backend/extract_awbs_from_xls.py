"""
Extract the AWB numbers from the Trackon order export (legacy .xls) into
data/awbs.txt (one AWB per line), which the Node worker reads.

Usage:
    python extract_awbs_from_xls.py "C:\\path\\to\\Order_Format1_27_07_2026.xls"
"""
import re
import sys
from pathlib import Path

import xlrd

AWB_RE = re.compile(r"^5\d{11}$")

DEFAULT_OUT = str(Path(__file__).resolve().parent / "data" / "awbs.txt")


def extract(xls_path: str, out_path: str = None) -> None:
    out_path = out_path or DEFAULT_OUT
    wb = xlrd.open_workbook(xls_path)
    sh = wb.sheet_by_name("Sheet1")

    headers = [str(sh.cell_value(0, c)).strip().lower() for c in range(sh.ncols)]
    if "awb no" not in headers and "awb number" not in headers and "new awb no" not in headers:
        raise SystemExit(f"Could not find an AWB column in headers: {headers}")

    original_col = next((c for c, h in enumerate(headers) if h in ("awb no", "awb number")), None)
    new_col = next((c for c, h in enumerate(headers) if h in ("new awb no", "new awb number")), None)

    awbs = []
    missing = 0
    for r in range(1, sh.nrows):
        new_awb = str(sh.cell_value(r, new_col)).strip() if new_col is not None else ""
        orig_awb = str(sh.cell_value(r, original_col)).strip() if original_col is not None else ""

        awb = new_awb if AWB_RE.match(new_awb) else orig_awb if AWB_RE.match(orig_awb) else ""
        if awb:
            awbs.append(awb)
        else:
            missing += 1

    unique = sorted(set(awbs))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text("\n".join(unique) + "\n", encoding="utf-8")

    print(f"Rows with data: {sh.nrows - 1}")
    print(f"Rows missing a valid AWB: {missing}")
    print(f"Unique AWB numbers: {len(unique)} -> {out_path}")
    print(f"Sample: {unique[:3]} ... {unique[-3:]}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_awbs_from_xls.py path/to/file.xls")
        sys.exit(1)
    extract(sys.argv[1])