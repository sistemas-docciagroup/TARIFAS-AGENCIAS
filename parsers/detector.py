from pathlib import Path

# Palabras clave de detección — fuente única en parsers/agency_meta.py
from parsers.agency_meta import KEYWORDS


def detect_agency(text: str, filename: str = "") -> str | None:
    """Detect agency from PDF text or filename. Returns agency name or None."""
    combined = (text or "") + " " + (filename or "")
    for agency, keywords in KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in combined.lower():
                return agency
    return None


def extract_text_from_file(path: Path) -> str:
    """Extract raw text from PDF or Excel for agency detection."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                pages_text = []
                for page in pdf.pages[:5]:  # first 5 pages enough for detection
                    t = page.extract_text() or ""
                    pages_text.append(t)
            return "\n".join(pages_text)
        elif suffix in {".xlsx", ".xls"}:
            import pandas as pd
            df = pd.read_excel(path, nrows=5, dtype=str)
            return " ".join(df.columns.tolist()) + " " + df.to_string()
        elif suffix == ".csv":
            import pandas as pd
            df = pd.read_csv(path, nrows=5, dtype=str, sep=None, engine="python")
            return df.to_string()
    except Exception:
        pass
    return ""
