"""
Parser de la TARIFA de DHL Parcel (Excel) → estructura de reglas para auditoría.

Producto "mamparas": precio por nº de BULTOS × ZONA (1–10).
Cada zona agrupa provincias (mapa en las columnas P/Q de la hoja).

Genera un dict para Tarifa.reglas_json con tipo_tarifa = "dhl_bultos_zona".
"""
import re
from pathlib import Path

_NUM = re.compile(r'^\d+$')
_PRICE = re.compile(r'^\d+(?:[.,]\d+)?$')


def _f(v) -> float | None:
    if v is None:
        return None
    s = str(v).strip().replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def parse_dhl_tariff(path: str | Path) -> dict | None:
    """Extrae tabla de precios bultos×zona + mapa provincia→zona del Excel mamparas."""
    import pandas as pd
    import warnings
    warnings.filterwarnings("ignore")
    path = Path(path)
    suf = path.suffix.lower().lstrip(".")
    engine = "pyxlsb" if suf == "xlsb" else ("xlrd" if suf == "xls" else "openpyxl")

    # Buscar la hoja con la tabla "Desde Bultos"
    try:
        xl = pd.ExcelFile(path, engine=engine)
    except Exception:
        return None
    hoja = None
    for sh in xl.sheet_names:
        d = pd.read_excel(path, sheet_name=sh, header=None, dtype=str, engine=engine)
        if d.astype(str).apply(lambda c: c.str.contains("Desde Bultos", na=False)).any().any():
            hoja = sh
            df = d
            break
    if hoja is None:
        return None

    # ── Fila de cabecera de la tabla (con "Desde Bultos") ────────────────────
    hdr_row = None
    for r in range(df.shape[0]):
        row = df.iloc[r].astype(str)
        if row.str.contains("Desde Bultos", na=False).any():
            hdr_row = r
            break
    if hdr_row is None:
        return None

    # Columnas Desde/Hasta + ZONA 1..10 según la cabecera
    desde_c = hasta_c = None
    zona_cols = {}   # zona_num -> col_idx
    for c in range(df.shape[1]):
        v = str(df.iat[hdr_row, c]).strip()
        if v.lower().startswith("desde"):
            desde_c = c
        elif v.lower().startswith("hasta"):
            hasta_c = c
        m = re.match(r'ZONA\s*(\d+)', v, re.I)
        if m and desde_c is not None:
            # ZONA n aparece 2 veces (col de precio y col del mapa); la primera
            # (más a la izquierda) es la de precio → setdefault la conserva.
            zona_cols.setdefault(m.group(1), c)
    if desde_c is None or hasta_c is None or not zona_cols:
        return None

    # ── Filas de precios ─────────────────────────────────────────────────────
    tramos = []
    for r in range(hdr_row + 1, df.shape[0]):
        b, h = df.iat[r, desde_c], df.iat[r, hasta_c]
        if b is None or h is None or not _NUM.match(str(b).strip()) or not _NUM.match(str(h).strip()):
            continue
        precios = {}
        for z, c in zona_cols.items():
            p = _f(df.iat[r, c])
            if p is not None:
                precios[z] = round(p, 2)
        if precios:
            tramos.append({"desde": int(b), "hasta": int(h), "precios": precios})
    if not tramos:
        return None

    # ── Mapa provincia → zona (recorrer columnas que contengan "ZONA N") ─────
    provincia_zona = _extract_zona_map(df)

    return {
        "tipo_tarifa": "dhl_bultos_zona",
        "tramos_bultos": tramos,
        "provincia_zona": provincia_zona,
    }


from normalizer import normalize_str as _norm


def _extract_zona_map(df) -> dict:
    """Recorre las columnas de mapa (las que tienen celdas 'ZONA N') de arriba a
    abajo: cada 'ZONA N' fija la zona y las celdas siguientes son sus provincias."""
    import pandas as pd
    provincia_zona = {}
    # Columnas candidatas: las que contienen alguna celda 'ZONA n' por debajo de
    # la cabecera de precios (no la propia fila de precios).
    for c in range(df.shape[1]):
        col = df.iloc[:, c].astype(str)
        zona_hits = col.str.contains(r'ZONA\s*\d+', case=False, na=False).sum()
        if zona_hits < 2:
            continue
        zona = None
        for r in range(df.shape[0]):
            v = df.iat[r, c]
            if pd.isna(v) or str(v).strip() == '':
                continue
            v = str(v).strip()
            m = re.match(r'ZONA\s*(\d+)', v, re.I)
            if m:
                zona = m.group(1)
            elif zona and not re.search(r'\d', v):   # provincia (sin números)
                prov = _norm(v.strip("() "))
                if prov:
                    provincia_zona[prov] = zona
    return provincia_zona
