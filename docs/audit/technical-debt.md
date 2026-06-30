# Technical Debt

The main concentration of debt is in the view layer: all `render()` functions are oversized, the worst reaching 511 lines. Two tracked TODOs mark pending integrations (SAP and Zendesk live mode). No hardcoded secrets were found; the SAP connection flag and the province-escalation map are the main hardcoded configuration values that should be moved to config.

---

## TODO / FIXME Comments

| File | Line | Comment |
|---|---|---|
| `services/sap_client.py` | 35 | `TODO: implementar la llamada real a SAP (RFC/OData/servicio web)` |
| `src/zendesk/client.ts` | 120 | `TODO: implementar envío real cuando se active el modo live` |

---

## Oversized Files (> 400 lines)

| File | Lines | Problem |
|---|---|---|
| `views/auditoria.py` | 612 | The entire audit results UI is one function of 511 lines |
| `views/carga.py` | 565 | Invoice upload + AI verification + Excel export all in one file |
| `services/geo_es.py` | 458 | A large lookup table (`CIUDAD_PROVINCIA`) accounts for most of the length |

---

## Oversized Functions (> 80 lines)

| File | Function | Start line | Lines | Notes |
|---|---|---|---|---|
| `views/auditoria.py` | `render()` | 102 | 511 | Entire audit view; should be split into sub-components |
| `views/carga.py` | `render()` | 339 | 227 | Invoice upload flow mixed with display logic |
| `views/resultados.py` | `render()` | 40 | 175 | Results table, filters, and export all inline |
| `views/carga.py` | `_build_report_excel()` | 181 | 156 | Should live in `exports/exporter.py` |
| `views/carga.py` | `_show_ai_result()` | 34 | 145 | AI result display; extractable as its own module |
| `views/tarifas.py` | `render()` | 117 | 145 | Tariff management UI; parsing logic mixed in |
| `services/ai_verifier.py` | `verify_invoice()` | 41 | 138 | Long prompt construction could be extracted |
| `views/reglas.py` | `render()` | 16 | 100 | Acceptable but approaching the limit |
| `parsers/molartrans.py` | `_extract_page()` | 151 | 97 | PDF parsing; complex but bounded |
| `views/dashboard.py` | `render()` | 19 | 90 | Acceptable |
| `services/tariff_engine.py` | `_molartrans_escalado()` | 73 | 85 | Complex business logic; should have unit tests |

---

## Hardcoded Configuration Values

**`services/sap_client.py:21`**
```python
SAP_CONECTADO = False
```
This is a feature flag that controls whether the real SAP integration is active. It should be an environment variable (`SAP_ENABLED=false` in `.env`) so it can be toggled without a code change.

**`parsers/molartrans_tarifa.py:28–33`**
```python
_CP_ESCALADO = {
    "41": "1",
    "11": "2", "21": "2", "14": "2", "29": "2",
    "23": "3", "18": "3", "04": "3",
}
```
The postal-code-to-escalation mapping is hardcoded in the tariff parser. If Molartrans changes their zone groupings, this must be updated in source code. It belongs in the tariff rules JSON (already stored in the database) so it can be updated through the UI.

---

## Missing Error Handling at Trust Boundaries

**`services/ai_verifier.py:159`** — The `openai.OpenAI()` client is created without checking for the presence of `OPENAI_API_KEY`. If the key is missing, the error surfaces as an unhelpful `openai.AuthenticationError` deep in the call stack instead of a clear early failure.

**`views/carga.py`** — File uploads from users are passed to parsers without size validation. A very large PDF will cause the server to attempt full processing before failing.
