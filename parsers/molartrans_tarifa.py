"""
Parser de la TARIFA de Molartrans (PDF) → estructura de reglas para auditoría.

La tarifa Molartrans tiene 3 escalados de precio según la provincia de destino:
    · ESC. 1  → Sevilla
    · ESC. 2  → Cádiz, Huelva, Córdoba, Málaga
    · ESC. 3  → Jaén, Granada, Almería
y dos tipos de material (MAMPARA / PALETS), cada uno con tramos de peso.

Genera un dict listo para serializar en Tarifa.reglas_json y consumir desde
services/tariff_engine.py (tipo_tarifa = "molartrans_escalados").
"""
import re
from pathlib import Path

# Fila de la tabla:  HASTA_KGS  ESC1 €  ESC2 €  ESC3 €  TIPO
_ROW_RE = re.compile(
    r'^(\d+)\s+'
    r'([\d.,]+)\s*[€�]\s+'
    r'([\d.,]+)\s*[€�]\s+'
    r'([\d.,]+)\s*[€�]\s+'
    r'(MAMPARA|PALETS?)',
    re.I,
)

# Mapa estándar provincia (prefijo CP) → escalado, para Andalucía.
# Sevilla=41 · Cádiz=11 · Huelva=21 · Córdoba=14 · Málaga=29 · Jaén=23 · Granada=18 · Almería=04
_CP_ESCALADO = {
    "41": "1",
    "11": "2", "21": "2", "14": "2", "29": "2",
    "23": "3", "18": "3", "04": "3",
}

_REEMB_RE = re.compile(r'Reembolsos?\s+([\d.,]+)\s*%', re.I)


def _num(s: str) -> float:
    return float(str(s).strip().replace('.', '').replace(',', '.'))


# ── Tarifa NACIONAL (resto de España): ZONA-destino × tramo kg (30/60/90/120) ──
# Fila:  NOMBRE_ZONA  precio30 €  precio60 €  precio90 €  precio120 €
_NAC_ROW_RE = re.compile(
    r'^([A-Za-zÁÉÍÓÚÑ�\.\s]+?)\s+'
    r'(\d+[.,]\d+)\s*[€�]\s+'
    r'(\d+[.,]\d+)\s*[€�]\s+'
    r'(\d+[.,]\d+)\s*[€�]\s+'
    r'(\d+[.,]\d+)\s*[€�]',
)


def _norm_zona(s: str) -> str:
    s = s.lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n"), ("�", "")):
        s = s.replace(a, b)
    return " ".join(s.split())


# Nombre de zona (normalizado, sin espacios) → provincia (clave del mapa CP)
_ZONA_PROVINCIA = {
    "madrid": "madrid", "valencia": "valencia", "alicante": "alicante",
    "murcia": "murcia", "toledo": "toledo", "guadalajara": "guadalajara",
}


def _parse_nacional(text: str) -> dict | None:
    """Tarifa nacional Molartrans: precio por zona-destino × tramo kg."""
    # Tramos de kg de la cabecera (30KG 60KG 90KG 120KG)
    tramos_kg = [int(x) for x in re.findall(r'(\d+)\s*KG', text, re.I)][:4]
    if len(tramos_kg) < 4:
        tramos_kg = [30, 60, 90, 120]

    zonas = {}
    for line in text.split('\n'):
        m = _NAC_ROW_RE.match(line.strip())
        if not m:
            continue
        nombre = _norm_zona(m.group(1))
        precios = [round(_num(m.group(i)), 2) for i in range(2, 6)]
        if nombre.startswith("resto") or "penins" in nombre:
            zonas["default"] = precios
        else:
            # quitar espacios internos por OCR (guadalajar a → guadalajara)
            prov = _ZONA_PROVINCIA.get(nombre) or _ZONA_PROVINCIA.get(nombre.replace(" ", ""))
            if prov:
                zonas[prov] = precios
    if not zonas:
        return None

    reemb = 3.5
    mr = _REEMB_RE.search(text)
    if mr:
        reemb = _num(mr.group(1))

    return {
        "tipo_tarifa": "molartrans_nacional",
        "tramos_kg": tramos_kg,
        "zonas": zonas,            # {provincia|default: [p30, p60, p90, p120]}
        "kg_por_bulto": 30,
        "reembolso_pct": reemb,
    }


def parse_tariff_pdf(path: str | Path) -> dict | None:
    """Devuelve las reglas estructuradas o None si no se reconoce el formato."""
    try:
        import pdfplumber
        with pdfplumber.open(Path(path)) as pdf:
            text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception:
        return None

    tramos: dict[str, list] = {"MAMPARA": [], "PALETS": []}
    for line in text.split('\n'):
        m = _ROW_RE.match(line.strip())
        if not m:
            continue
        hasta = int(m.group(1))
        precios = {
            "1": round(_num(m.group(2)), 2),
            "2": round(_num(m.group(3)), 2),
            "3": round(_num(m.group(4)), 2),
        }
        tipo = "PALETS" if m.group(5).upper().startswith("PALET") else "MAMPARA"
        tramos[tipo].append({"hasta": hasta, "precios": precios})

    if not tramos["MAMPARA"] and not tramos["PALETS"]:
        # No es el formato de escalados → probar el formato NACIONAL (zona × kg)
        return _parse_nacional(text)

    for t in tramos.values():
        t.sort(key=lambda x: x["hasta"])

    reemb = 2.5
    mr = _REEMB_RE.search(text)
    if mr:
        reemb = _num(mr.group(1))

    return {
        "tipo_tarifa": "molartrans_escalados",
        "cp_escalado": _CP_ESCALADO,
        # Bultos y paquetes sueltos se tarifan como MAMPARA del tramo mínimo
        "bulto_paquete_como": {"material": "MAMPARA", "hasta": 30},
        # Sin peso conocido: 1 bulto = 30 kg, 2 bultos = 60 kg, …
        "kg_por_bulto": 30,
        "tramos": tramos,
        "reembolso_pct": reemb,
    }
