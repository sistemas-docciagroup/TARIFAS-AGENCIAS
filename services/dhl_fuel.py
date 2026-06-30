"""
Recargo por combustible de DHL, por MES y ámbito (doméstico / internacional).

DHL publica el % cada mes (https://www.dhl.com/.../fuel-surcharge.html). El % se
aplica sobre "Portes + Reexpedición". Aquí lo guardamos por mes en
`data/dhl_fuel.json` para poder desglosar "Otros" de forma exacta.

Regla de negocio (pedida por el usuario): si auditamos una factura de un mes del
que NO tenemos el %, hay que AVISAR para que se actualice (no inventarlo), de
modo que el desglose sea siempre correcto.

Formato de data/dhl_fuel.json:
    { "2026-04": {"domestico": 16.0, "internacional": 46.0}, ... }
"""
import json
from pathlib import Path

_PATH = Path(__file__).resolve().parent.parent / "data" / "dhl_fuel.json"


def _load() -> dict:
    if _PATH.exists():
        try:
            return json.loads(_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save(data: dict) -> None:
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    _PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def month_key(fecha_iso: str | None) -> str | None:
    """De 'YYYY-MM-DD' → 'YYYY-MM'."""
    if not fecha_iso or len(str(fecha_iso)) < 7:
        return None
    return str(fecha_iso)[:7]


def get_fuel_pct(fecha_iso: str | None, internacional: bool) -> float | None:
    """% de combustible (como fracción, p. ej. 0.16) para ese mes y ámbito, o None."""
    mk = month_key(fecha_iso)
    if not mk:
        return None
    data = _load()
    mes = data.get(mk)
    if not mes:
        return None
    val = mes.get("internacional" if internacional else "domestico")
    return float(val) / 100.0 if val is not None else None


def set_fuel_pct(mes: str, domestico: float, internacional: float, asumido: bool = False) -> None:
    """Guarda/actualiza el % de un mes (valores en %). asumido=True si es estimado."""
    data = _load()
    data[mes] = {"domestico": float(domestico), "internacional": float(internacional),
                 "asumido": bool(asumido)}
    _save(data)


def es_asumido(fecha_iso: str | None) -> bool:
    mk = month_key(fecha_iso)
    return bool(mk and _load().get(mk, {}).get("asumido"))


def meses_disponibles() -> dict:
    return _load()


def meses_faltantes(fechas_iso) -> list[str]:
    """Meses (YYYY-MM) presentes en las fechas dadas para los que falta el %."""
    data = _load()
    faltan = set()
    for f in fechas_iso:
        mk = month_key(f)
        if mk and mk not in data:
            faltan.add(mk)
    return sorted(faltan)
