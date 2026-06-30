import re


def normalize_albaran(ref: str, agencia: str) -> tuple[str | None, str]:
    """
    Normalize a reference string according to agency rules.
    Returns (albaran_normalizado, estado).
    """
    if not ref or not str(ref).strip():
        return None, "SIN_REFERENCIA"

    ref = str(ref).strip()
    ag = agencia.upper()

    if "MOLARTRANS" in ag:
        result = ref.lstrip("0")
        return (result or None), ("ALBARAN_OK" if result else "SIN_REFERENCIA")

    if "CEVA" in ag:
        result = ref.lstrip("0")
        return (result or None), ("ALBARAN_OK" if result else "SIN_REFERENCIA")

    if "TDN" in ag or "TRANSCOMENSAL" in ag:
        # Quitar exactamente 2 ceros del inicio
        result = re.sub(r"^00", "", ref)
        return result, "ALBARAN_OK"

    if "DHL PARCEL" in ag or "DHLPARCEL" in ag:
        # Quitar '41' del inicio + quitar último carácter '0'
        r = ref
        if r.startswith("41"):
            r = r[2:]
        if r.endswith("0"):
            r = r[:-1]
        return (r or None), ("ALBARAN_OK" if r else "SIN_REFERENCIA")

    if "DSV" in ag:
        _sin_ref = {"SIN REF", "SIN_REF", "SINREF", "S/REF", ""}
        if ref.upper() in _sin_ref:
            return None, "SIN_REFERENCIA"
        return ref, "ALBARAN_OK"

    if "DHL FREIGHT" in ag or "DHLFREIGHT" in ag:
        # No aplica normalización de albarán — usa referencia FRT
        return ref, "EXPEDICION_AGENCIA"

    return ref, "ALBARAN_OK"


def normalize_date(value: str | None) -> str | None:
    """Parse common date formats to YYYY-MM-DD."""
    if not value:
        return None
    value = str(value).strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            from datetime import datetime
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value


def normalize_float(value) -> float | None:
    if value is None:
        return None
    s = str(value).strip().replace("€", "").replace(" ", "")
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def normalize_int(value) -> int | None:
    try:
        return int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
