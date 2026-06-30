"""
Parser de la TARIFA de TDN (PDF) → estructura de reglas para auditoría.

TDN tarifica por PESO (tramo "Hasta kg") × BAREMO (B1–B7). Cada destino tiene un
baremo asignado. La factura de TDN trae el CP de destino y el PESO REAL, así que
la auditoría es objetiva: CP → baremo → precio(peso, baremo) vs portes.

El precio (pesos×baremo) se lee del PDF. El mapa CP→baremo se ha derivado del
cruce con facturas reales (qué baremo cuadra con el porte cobrado), porque el PDF
solo lista nombres de destino, no códigos postales. Se afina con más facturas.
"""
import re
from pathlib import Path

_ROW = re.compile(r'^(\d+)\s+((?:\d+[.,]\d+\s+){7})')

# CP (2 dígitos = provincia) → baremo.
# Provincias vistas en facturas: baremo DERIVADO del cruce real (fiable).
# Provincias no vistas aún: baremo de la tarifa PDF (se afina al llegar facturas).
_CP_BAREMO = {
    # — derivadas de facturas reales —
    "01": 5, "02": 3, "03": 4, "04": 3, "06": 2, "07": 7, "08": 6, "09": 4,
    "10": 3, "11": 1, "12": 4, "14": 1, "15": 5, "16": 4, "17": 6, "18": 1,
    "19": 4, "20": 6, "21": 1, "22": 6, "23": 2, "26": 5, "27": 5, "28": 3,
    "29": 1, "30": 3, "31": 5, "32": 5, "33": 5, "36": 5, "39": 5, "41": 1,
    "43": 5, "44": 6, "45": 3, "46": 4, "48": 5, "50": 5, "52": 1,
    # — no vistas aún (de la tarifa PDF) —
    "05": 4, "13": 3, "24": 4, "25": 6, "34": 5, "37": 5, "40": 5, "42": 1,
    "47": 4, "49": 5,
}
# Excepciones por CP completo (ciudades con baremo distinto al de su provincia):
# p. ej. Algeciras (Cádiz) y varias localidades de Cáceres.
_CP_BAREMO_EXC = {
    "11380": 2, "11379": 2, "11300": 2,
    "10613": 2, "10100": 2, "10840": 2, "10260": 2, "10195": 2,
}


def _num(s):
    return round(float(str(s).replace(',', '.')), 2)


def baremo_de_cp(cp: str | None) -> int | None:
    if not cp:
        return None
    cp = str(cp).strip()
    if cp in _CP_BAREMO_EXC:
        return _CP_BAREMO_EXC[cp]
    return _CP_BAREMO.get(cp[:2])


def parse_tdn_tariff(path: str | Path) -> dict | None:
    """Extrae del PDF la tabla peso × baremo (B1–B7) + mapa CP→baremo."""
    try:
        import pdfplumber
        with pdfplumber.open(Path(path)) as pdf:
            text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception:
        return None

    pesos, precios = [], []
    for line in text.split('\n'):
        m = _ROW.match(line.strip())
        if m:
            pesos.append(int(m.group(1)))
            precios.append([_num(x) for x in m.group(2).split()])
    if not pesos:
        return None

    reemb = 3.5
    mr = re.search(r'Reembolsos?\s+([\d.,]+)\s*%', text, re.I)
    if mr:
        reemb = _num(mr.group(1))

    return {
        "tipo_tarifa": "tdn_peso_baremo",
        "pesos": pesos,                 # tramos "hasta kg"
        "precios": precios,             # precios[i] = [B1..B7] para peso <= pesos[i]
        "cp_baremo": _CP_BAREMO,
        "cp_baremo_exc": _CP_BAREMO_EXC,
        "reembolso_pct": reemb,
    }
