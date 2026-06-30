import re
from pathlib import Path
from parsers.base_parser import BaseParser
from normalizer import normalize_albaran

# ── Tabla de la factura DHL Parcel ────────────────────────────────────────────
# Cabecera:
#   Expedición | Fecha | Destino | Consignatar. | Su referencia | Blt | Kilos |
#   Portes | Seguro | Reexped | Otros | Total
#
# Igual que Molartrans, las columnas de importe pueden venir VACÍAS, así que cada
# valor se asigna a su columna por su coordenada X (centro), no por orden.

# Centros X por defecto (fallback si no se detecta la cabecera en la página)
_DEFAULT_CENTERS = {
    "Expedicion": 47.0, "Fecha": 82.0, "Destino": 112.0, "Consignatario": 164.0,
    "Referencia": 227.0, "Blt": 343.0, "Kilos": 368.0, "Portes": 408.0,
    "Seguro": 437.0, "Reexped": 469.0, "Otros": 510.0, "Total": 552.0,
}

# Mapeo de palabras de cabecera → columna canónica
_HEADER_MAP = {
    "Expedici": "Expedicion", "Fecha": "Fecha", "Destino": "Destino",
    "Consignatar": "Consignatario", "referencia": "Referencia",
    "Blt": "Blt", "Kilos": "Kilos", "Portes": "Portes", "Seguro": "Seguro",
    "Reexped": "Reexped", "Otros": "Otros", "Total": "Total",
}

_MONEY_RE = re.compile(r'^\d{1,3}(?:\.\d{3})*,\d{2}$')
_INT_RE   = re.compile(r'^\d+$')
_EXP_RE   = re.compile(r'^\d{8,}$')           # nº de expedición (≥8 dígitos)
_FECHA_RE = re.compile(r'^(\d{1,2})-(\d{1,2})$')

_FAC_NUM_RE   = re.compile(r'N[ºo°]?\s*de\s*Factura:\s*(\S+)', re.I)
_FAC_FECHA_RE = re.compile(r'Fecha\s*Factura:\s*(\d{2}-\d{2}-\d{4})', re.I)


def _num(s: str) -> float:
    try:
        return float(str(s).strip().replace('.', '').replace(',', '.'))
    except ValueError:
        return 0.0


def _group_lines(words, tol=3.0):
    if not words:
        return []
    ws = sorted(words, key=lambda w: (round(w["top"]), w["x0"]))
    lines, cur, last = [], [], None
    for w in ws:
        if last is None or abs(w["top"] - last) <= tol:
            cur.append(w)
        else:
            lines.append(sorted(cur, key=lambda x: x["x0"]))
            cur = [w]
        last = w["top"]
    if cur:
        lines.append(sorted(cur, key=lambda x: x["x0"]))
    return lines


def _detect_centers(lines):
    for ln in lines:
        txts = {w["text"] for w in ln}
        if any("xpedici" in t for t in txts) and "Total" in txts and "Portes" in txts:
            centers = {}
            for w in ln:
                cx = (w["x0"] + w["x1"]) / 2
                for key, col in _HEADER_MAP.items():
                    if key.lower() in w["text"].lower():
                        centers.setdefault(col, cx)
            if all(c in centers for c in ("Portes", "Total", "Blt")):
                return centers
    return None


def _boundaries(centers: dict):
    """Convierte centros de columna en rangos [izq, der) ordenados por X."""
    cols = sorted(centers.items(), key=lambda kv: kv[1])
    bounds = []
    for i, (col, c) in enumerate(cols):
        left = (cols[i - 1][1] + c) / 2 if i > 0 else float("-inf")
        right = (cols[i + 1][1] + c) / 2 if i < len(cols) - 1 else float("inf")
        bounds.append((left, right, col))
    return bounds


def _col_at(cx: float, bounds):
    for left, right, col in bounds:
        if left <= cx < right:
            return col
    return None


class DHLParcelParser(BaseParser):
    agency_name = "DHL Parcel"

    def parse(self, source) -> list[dict]:
        path = Path(source)
        suffix = path.suffix.lower()
        try:
            if suffix in {".xlsx", ".xlsm", ".xlsb", ".xls", ".csv"}:
                return self._parse_excel(path)
            return self._parse_pdf(path)
        except Exception as e:
            row = self.empty_row()
            row["estado_cruce"] = "ERROR_LECTURA"
            row["observaciones"] = str(e)
            return [row]

    # ── PDF (factura por posición de columnas) ────────────────────────────────
    def _parse_pdf(self, path: Path) -> list[dict]:
        import pdfplumber
        rows = []
        factura = ""
        anio = "2026"
        with pdfplumber.open(path) as pdf:
            first = pdf.pages[0].extract_text() or ""
            m = _FAC_NUM_RE.search(first)
            if m:
                factura = m.group(1).strip()
            m = _FAC_FECHA_RE.search(first)
            if m:
                anio = m.group(1).split("-")[-1]

            centers = dict(_DEFAULT_CENTERS)
            for page in pdf.pages:
                lines = _group_lines(page.extract_words())
                det = _detect_centers(lines)
                if det:
                    centers = det
                bounds = _boundaries(centers)
                for ln in lines:
                    row = self._parse_line(ln, bounds, factura, anio)
                    if row:
                        rows.append(row)
        if not rows:
            r = self.empty_row()
            r["factura"] = factura
            r["estado_cruce"] = "DUDOSO"
            r["observaciones"] = "Ninguna línea de expedición reconocida."
            return [r]
        return rows

    def _parse_line(self, ln, bounds, factura, anio):
        if len(ln) < 5:
            return None
        if not (_EXP_RE.match(ln[0]["text"]) and _FECHA_RE.match(ln[1]["text"])):
            return None

        expedicion = ln[0]["text"]
        fm = _FECHA_RE.match(ln[1]["text"])
        dia, mes = fm.group(1).zfill(2), fm.group(2).zfill(2)
        fecha_iso = f"{anio}-{mes}-{dia}"

        destino_w, consig_w = [], []
        referencia = ""
        vals = {}      # columnas de importe
        bultos = kilos = None

        for w in ln[2:]:
            txt = w["text"]
            cx = (w["x0"] + w["x1"]) / 2
            col = _col_at(cx, bounds)
            if _MONEY_RE.match(txt):
                if col in ("Portes", "Seguro", "Reexped", "Otros", "Total"):
                    vals[col] = _num(txt)
                else:
                    vals["Total"] = _num(txt)        # importe suelto → total
            elif _INT_RE.match(txt):
                if col == "Blt":
                    bultos = int(txt)
                elif col == "Kilos":
                    kilos = float(txt)
                elif col == "Referencia":
                    referencia = txt
                else:
                    referencia = referencia or txt
            else:  # texto
                if col == "Destino":
                    destino_w.append(txt)
                else:  # Consignatario o zona de referencia con texto
                    consig_w.append(txt)

        albaran_doccia, estado = normalize_albaran(referencia, self.agency_name)

        row = self.empty_row()
        row.update({
            "factura":            factura,
            "fecha_envio":        fecha_iso,
            "expedicion_agencia": expedicion,
            "albaran_doccia":     albaran_doccia,
            "destinatario":       " ".join(consig_w).strip(),
            "destino":            " ".join(destino_w).strip(),
            "bultos":             bultos,
            "kilos":              kilos,
            "portes":             vals.get("Portes"),
            "seguro":             vals.get("Seguro"),
            "reexpedicion":       vals.get("Reexped"),
            "otros":              vals.get("Otros"),
            "total_facturado":    vals.get("Total"),
            "estado_cruce":       estado,
            "observaciones":      f"Ref: {referencia}" if referencia else "",
        })
        return row

    # ── Excel / CSV ───────────────────────────────────────────────────────────
    def _parse_excel(self, path: Path) -> list[dict]:
        import pandas as pd
        df = pd.read_csv(path, dtype=str) if path.suffix.lower() == ".csv" \
            else pd.read_excel(path, dtype=str)
        rows = []
        for _, r in df.fillna("").iterrows():
            row = self.empty_row()
            row["observaciones"] = " | ".join(f"{k}:{v}" for k, v in r.items() if v)
            rows.append(row)
        return rows
