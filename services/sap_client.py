"""
Cliente SAP (stub) — punto único para enriquecer un albarán con datos de SAP.

Idea: enviamos el nº de albarán Doccia y SAP nos devuelve los datos que la
auditoría necesita según la agencia (en DHL: el CÓDIGO POSTAL de destino, que
permite resolver la zona de forma exacta, sin depender del nombre de ciudad).

Mientras SAP no está conectado:
  · Si existe `data/sap_overrides.json` (mapa {albaran: {"cp": "...", ...}}),
    se usa como fuente manual de datos.
  · Si no, devuelve None y la auditoría cae al método por ciudad + importe.

Cuando se conecte SAP de verdad, basta implementar `_fetch_from_sap`.
"""
import json
from pathlib import Path
from functools import lru_cache

_OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "sap_overrides.json"

SAP_CONECTADO = False   # cambiar a True cuando _fetch_from_sap esté implementado


@lru_cache(maxsize=1)
def _overrides() -> dict:
    if _OVERRIDES_PATH.exists():
        try:
            return json.loads(_OVERRIDES_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _fetch_from_sap(albaran: str, agencia: str) -> dict | None:
    """TODO: implementar la llamada real a SAP (RFC/OData/servicio web)."""
    return None


def get_albaran_data(albaran: str | None, agencia: str) -> dict | None:
    """Devuelve datos de SAP del albarán (p. ej. {'cp': '45600', ...}) o None."""
    if not albaran:
        return None
    alb = str(albaran).strip()
    if SAP_CONECTADO:
        data = _fetch_from_sap(alb, agencia)
        if data:
            return data
    return _overrides().get(alb)


def get_cp(albaran: str | None, agencia: str) -> str | None:
    """Atajo: código postal de destino del albarán según SAP (o None)."""
    data = get_albaran_data(albaran, agencia)
    if data and data.get("cp"):
        return str(data["cp"]).strip()
    return None


def get_peso(albaran: str | None, agencia: str) -> float | None:
    """Peso REAL del envío según SAP (o None). El peso de las facturas Molartrans
    no es fiable; cuando SAP esté conectado, este es el peso bueno para el tramo."""
    data = get_albaran_data(albaran, agencia)
    if data and data.get("peso") is not None:
        try:
            return float(data["peso"])
        except (TypeError, ValueError):
            return None
    return None
