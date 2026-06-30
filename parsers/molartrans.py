import re
from pathlib import Path
from parsers.base_parser import BaseParser
from normalizer import normalize_albaran

# ── Columnas reales del PDF Molartrans (tabla de albaranes) ───────────────────
# Albaran | Fecha | Concepto | Rembolso | Unds. | Importe | Dto | RC | Seguro | Comision | Total
#
# Cada importe se asigna a su columna por su COORDENADA X (centro), NO por orden
# secuencial: hay columnas que pueden venir vacías (p. ej. Rembolso/Comision solo
# aparecen en envíos contra reembolso) y el orden secuencial desplazaba columnas.
#   · Importe  = portes (base de transporte)
#   · Dto      = descuento (normalmente 0)
#   · RC       = recargo de combustible (~7%)
#   · Seguro   = seguro LOTT (normalmente 0)
#   · Comision = comisión de contrareembolso (2,5% del valor declarado; solo si hay Rembolso)
#   · Total    = Importe + RC + Seguro + Comision
_COLS = ["Rembolso", "Unds", "Importe", "Dto", "RC", "Seguro", "Comision", "Total"]

# Centros X por defecto (fallback si no se detecta la cabecera en la página)
_DEFAULT_CENTERS = {
    "Rembolso": 236.0, "Unds": 272.0, "Importe": 315.0, "Dto": 371.0,
    "RC": 416.0, "Seguro": 462.0, "Comision": 511.0, "Total": 550.0,
}
# Distancia máxima (px) para aceptar que un importe pertenece a una columna
_MAX_DIST = 28.0

# Cabeceras de columna tal como aparecen en el texto del PDF
_HEADER_LABELS = {
    "Albaran": "Albaran", "Rembolso": "Rembolso", "Unds.": "Unds",
    "Importe": "Importe", "Dto": "Dto", "RC": "RC", "Seguro": "Seguro",
    "Comision": "Comision", "Total": "Total",
}

_NUM_TOK_RE = re.compile(r'^\d{1,3}(?:\.\d{3})*,\d{2}$')   # importe tipo 1.234,56
_INT_TOK_RE = re.compile(r'^\d+$')
_ALB_RE     = re.compile(r'^\d{5,7}$')
_FECHA_RE   = re.compile(r'^\d{2}/\d{2}/\d{4}$')

_DEST_RE = re.compile(r'>\s*Dest:\s*.+?\((\d{5})\)\s+(.+?)\s+Zona:\s*(\d+)', re.I)
_REF_RE  = re.compile(r'Ref\.\s*Cliente:\s*(\S+)', re.I)

# pdfplumber fusiona "Tipo: Mampara hasta 60Kg" con "Orig:" carácter a carácter
# (p. ej. "Mampara hasta 60O rKigg:"). Extraemos material y tramo por separado.
_MATERIAL_RE = re.compile(r'Tipo:\s*(Mampara|Palet|Bulto|Paquete)', re.I)
_HASTA_RE    = re.compile(r'hasta\s+(\d+)', re.I)
_MATERIAL_MAP = {"mampara": "MAMPARA", "palet": "PALETS", "bulto": "BULTO", "paquete": "PAQUETE"}

_FAC_NUM_RE   = re.compile(r'FACTURA\s+N[^:]*:\s*(\S+)', re.I)
_FAC_FECHA_RE = re.compile(r'Fecha:\s*(\d{2}-\d{2}-\d{4})', re.I)


def _num(s: str) -> float:
    try:
        return float(str(s).strip().replace('.', '').replace(',', '.'))
    except ValueError:
        return 0.0


def _iso(fecha: str) -> str:
    fecha = fecha.replace('-', '/')
    p = fecha.split('/')
    return f"{p[2]}-{p[1].zfill(2)}-{p[0].zfill(2)}" if len(p) == 3 else fecha


def _group_lines(words: list[dict], tol: float = 4.0) -> list[list[dict]]:
    """Agrupa palabras en líneas visuales por su coordenada 'top'."""
    if not words:
        return []
    ws = sorted(words, key=lambda w: (round(w["top"]), w["x0"]))
    lines, current, last_top = [], [], None
    for w in ws:
        if last_top is None or abs(w["top"] - last_top) <= tol:
            current.append(w)
        else:
            lines.append(sorted(current, key=lambda x: x["x0"]))
            current = [w]
        last_top = w["top"]
    if current:
        lines.append(sorted(current, key=lambda x: x["x0"]))
    return lines


def _detect_centers(lines: list[list[dict]]) -> dict | None:
    """Busca la fila de cabecera y devuelve los centros X de cada columna."""
    for ln in lines:
        texts = {w["text"] for w in ln}
        if "Albaran" in texts and "Importe" in texts and "Total" in texts:
            centers = {}
            for w in ln:
                col = _HEADER_LABELS.get(w["text"])
                if col:
                    centers[col] = (w["x0"] + w["x1"]) / 2
            # Necesitamos al menos las columnas de importe
            if all(c in centers for c in ("Importe", "RC", "Seguro", "Total")):
                return centers
    return None


def _assign_column(cx: float, centers: dict) -> str | None:
    """Devuelve la columna cuyo centro está más cerca de cx (si dentro de _MAX_DIST)."""
    best, best_d = None, _MAX_DIST
    for col, c in centers.items():
        d = abs(c - cx)
        if d < best_d:
            best, best_d = col, d
    return best


class MolartransParser(BaseParser):
    agency_name = "Molartrans"

    def parse(self, source) -> list[dict]:
        path = Path(source)
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                first_text = pdf.pages[0].extract_text() or ""

                factura = fecha_fac = ""
                m = _FAC_NUM_RE.search(first_text)
                if m:
                    factura = m.group(1).strip()
                m = _FAC_FECHA_RE.search(first_text)
                if m:
                    fecha_fac = _iso(m.group(1))

                rows = []
                centers = dict(_DEFAULT_CENTERS)
                for page in pdf.pages:
                    words = page.extract_words(use_text_flow=False)
                    lines = _group_lines(words)
                    detected = _detect_centers(lines)
                    if detected:
                        centers = detected
                    rows.extend(self._extract_page(lines, centers, factura))
        except Exception as e:
            row = self.empty_row()
            row["estado_cruce"]  = "ERROR_LECTURA"
            row["observaciones"] = str(e)
            return [row]

        if not rows:
            row = self.empty_row()
            row["factura"]       = factura
            row["estado_cruce"]  = "DUDOSO"
            row["observaciones"] = "Ninguna línea de albarán reconocida en el PDF."
            return [row]
        return rows

    def _extract_page(self, lines: list[list[dict]], centers: dict, factura: str) -> list[dict]:
        results = []
        for idx, ln in enumerate(lines):
            if len(ln) < 3:
                continue
            # ¿Línea de albarán? → primer token = nº albarán, segundo = fecha
            if not (_ALB_RE.match(ln[0]["text"]) and _FECHA_RE.match(ln[1]["text"])):
                continue

            albaran_mol = ln[0]["text"]
            fecha_str   = ln[1]["text"]

            # ── Asignar cada importe / unidad a su columna por posición X ──────
            col_vals: dict[str, float] = {}
            bultos = 0
            concept_parts = []
            for w in ln[2:]:
                txt = w["text"]
                cx  = (w["x0"] + w["x1"]) / 2
                if _NUM_TOK_RE.match(txt):                      # importe monetario
                    col = _assign_column(cx, centers)
                    if col and col not in ("Unds",):
                        col_vals[col] = _num(txt)
                elif _INT_TOK_RE.match(txt):                    # entero → unidades
                    col = _assign_column(cx, centers)
                    if col == "Unds":
                        bultos = int(txt)
                    elif col in ("Rembolso", "Importe"):        # raro, ignorar
                        pass
                elif not any(ch.isdigit() for ch in txt):       # palabra del concepto
                    if cx < centers.get("Rembolso", 236):
                        concept_parts.append(txt)

            portes      = col_vals.get("Importe", 0.0)
            descuento   = col_vals.get("Dto", 0.0)
            combustible = col_vals.get("RC", 0.0)              # recargo combustible
            seguro      = col_vals.get("Seguro", 0.0)
            contrareemb = col_vals.get("Comision", 0.0)        # comisión de contrareembolso
            total       = col_vals.get("Total", 0.0)
            rembolso    = col_vals.get("Rembolso", 0.0)        # valor declarado (base 2,5%)

            destinatario = " ".join(concept_parts).strip()

            # ── Línea de detalle (siguiente): Tipo, Dest, Zona, kg ─────────────
            cp = ciudad = zona = ""
            material = ""
            tramo_kg = None
            kilos = None
            ref_cliente = ""
            if idx + 1 < len(lines):
                det = " ".join(w["text"] for w in lines[idx + 1])
                md = _DEST_RE.search(det)
                if md:
                    cp, ciudad, zona = md.group(1), md.group(2).strip(), md.group(3)
                mm = _MATERIAL_RE.search(det)
                if mm:
                    material = _MATERIAL_MAP.get(mm.group(1).lower(), mm.group(1).upper())
                mh = _HASTA_RE.search(det)
                if mh:
                    tramo_kg = int(mh.group(1))
                    kilos    = float(tramo_kg)
            if idx + 2 < len(lines):
                ref = " ".join(w["text"] for w in lines[idx + 2])
                mr = _REF_RE.search(ref)
                if mr:
                    ref_cliente = mr.group(1).strip()

            tipo = material
            if tramo_kg:
                tipo = f"{material} hasta {tramo_kg}Kg".strip()

            albaran_doccia, estado = normalize_albaran(ref_cliente, self.agency_name)

            obs = f"Tipo: {tipo} | Zona: {zona}" if (zona or tipo) else ""
            if rembolso:
                obs += f" | Rembolso: {rembolso:.2f}"

            row = self.empty_row()
            row.update({
                "factura":            factura,
                "fecha_envio":        _iso(fecha_str),
                "expedicion_agencia": albaran_mol,
                "albaran_doccia":     albaran_doccia,
                "destinatario":       destinatario,
                "destino":            f"{ciudad} ({cp})" if cp else ciudad,
                "bultos":             bultos,
                "kilos":              kilos,
                "portes":             portes,
                "combustible":        combustible if combustible else None,   # RC
                "seguro":             seguro if seguro else None,
                "otros":              contrareemb if contrareemb else None,    # contrareembolso
                "total_facturado":    total,
                "estado_cruce":       estado,
                "observaciones":      obs,
            })
            results.append(row)
        return results
