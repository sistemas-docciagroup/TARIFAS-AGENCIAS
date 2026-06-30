"""
SAP R3 SOAP client — single entry point to enrich an albaran with SAP data.

Operation: Z_ALBARAN_PESOS
Input:  I_ALBARAN (albaran number, padded to 10 chars with zfill)
Output: cp, peso_total, poblacion, provincia, bultos, importe, reembolso, pais

Configuration (env vars):
  SAP_ENABLED=true        activate real SAP calls (default: false)
  SAP_ENDPOINT            SOAP service URL (no credentials — auth is internal to SAP)
  SAP_CALL_DELAY_MS       minimum ms between consecutive SAP calls (default: 200)

Rate limiting — IMPORTANT:
  SAP calls are throttled: a minimum delay of SAP_CALL_DELAY_MS ms is enforced
  between consecutive network calls to avoid timeouts and backend overload.
  Results are cached in memory for the lifetime of the process so the same
  albaran is never fetched twice in a single session.

Fallback: if SAP is disabled or unavailable, reads data/sap_overrides.json
  format: {"8770494": {"cp": "07702", "peso": 39.083, ...}}
"""
import html
import os
import json
import time
import defusedxml.ElementTree as ET
from pathlib import Path
from functools import lru_cache

import requests

_OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data" / "sap_overrides.json"
_SAP_NS = "urn:sap-com:document:sap:rfc:functions"

# In-process cache: avoids duplicate SAP calls for the same albaran within a session.
# Stores dict (found) or None (not found / error). Keyed by raw albaran string.
_sap_cache: dict[str, dict | None] = {}
_last_sap_call: float = 0.0  # monotonic timestamp of last real SAP network call

_SOAP_TEMPLATE = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'
    ' xmlns:urn="urn:sap-com:document:sap:rfc:functions">'
    "<soapenv:Header/>"
    "<soapenv:Body>"
    "<urn:Z_ALBARAN_PESOS>"
    "<I_ALBARAN>{albaran}</I_ALBARAN>"
    "</urn:Z_ALBARAN_PESOS>"
    "</soapenv:Body>"
    "</soapenv:Envelope>"
)


@lru_cache(maxsize=1)
def _overrides() -> dict:
    if _OVERRIDES_PATH.exists():
        try:
            return json.loads(_OVERRIDES_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _fetch_from_sap(albaran: str, agencia: str) -> dict | None:
    global _last_sap_call

    endpoint = os.getenv("SAP_ENDPOINT", "").strip()
    if not endpoint:
        return None

    # Rate limit: enforce minimum delay between consecutive SAP network calls
    delay_ms = float(os.getenv("SAP_CALL_DELAY_MS", "200"))
    elapsed_ms = (time.monotonic() - _last_sap_call) * 1000
    if elapsed_ms < delay_ms:
        time.sleep((delay_ms - elapsed_ms) / 1000)

    body = _SOAP_TEMPLATE.format(albaran=html.escape(albaran.zfill(10)))
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "Z_ALBARAN_PESOS",
    }
    try:
        _last_sap_call = time.monotonic()
        resp = requests.post(
            endpoint,
            data=body.encode("utf-8"),
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
    except requests.RequestException:
        return None

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError:
        return None

    res = root.find(f".//{{{_SAP_NS}}}Z_ALBARAN_PESOSResponse")
    if res is None:
        return None

    # Child elements have no namespace prefix in SAP's response
    def _text(tag: str) -> str | None:
        v = (res.findtext(tag) or "").strip()
        return v or None

    def _float(tag: str) -> float | None:
        v = _text(tag)
        try:
            return float(v) if v else None
        except ValueError:
            return None

    def _int(tag: str) -> int | None:
        v = _text(tag)
        try:
            return int(v) if v else None
        except ValueError:
            return None

    status = _text("E_RESPUESTA_TXT") or ""
    if status.upper().startswith("ERROR"):
        return None

    # SAP returns empty E_ALBARAN when the albaran is not found
    if not _text("E_ALBARAN"):
        return None

    return {
        "cp":          _text("E_CP"),
        "peso":        _float("E_PESO_TOTAL"),
        "poblacion":   _text("E_POBLACION"),
        "provincia":   _text("E_PROVINCIA"),
        "bultos":      _int("E_TOTAL_BULTOS"),
        "importe":     _float("E_IMPORTE"),
        "reembolso":   _float("E_REEMBOLSO"),
        "pais":        _text("E_PAIS"),
        "nombre_dest": _text("E_NOMBRE_DEST"),
    }


def get_albaran_data(albaran: str | None, agencia: str) -> dict | None:
    """Return SAP data for the albaran (all fields) or None.

    Results are cached in _sap_cache for the process lifetime.
    SAP calls are rate-limited to SAP_CALL_DELAY_MS ms apart.
    """
    if not albaran:
        return None
    alb = str(albaran).strip()
    if os.getenv("SAP_ENABLED", "false").lower() == "true":
        if alb not in _sap_cache:
            _sap_cache[alb] = _fetch_from_sap(alb, agencia)
        data = _sap_cache[alb]
        if data:
            return data
    return _overrides().get(alb)


def get_cp(albaran: str | None, agencia: str) -> str | None:
    """Delivery postal code from SAP."""
    data = get_albaran_data(albaran, agencia)
    return (data or {}).get("cp")


def get_peso(albaran: str | None, agencia: str) -> float | None:
    """Real shipment weight from SAP (more reliable than invoice weight)."""
    data = get_albaran_data(albaran, agencia)
    return (data or {}).get("peso")


def get_bultos(albaran: str | None, agencia: str) -> int | None:
    """Package count from SAP (validates/overrides what the invoice reports)."""
    data = get_albaran_data(albaran, agencia)
    return (data or {}).get("bultos")
