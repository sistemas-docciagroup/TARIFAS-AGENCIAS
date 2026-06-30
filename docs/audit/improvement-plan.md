# Improvement Plan

Items are ordered by effort-to-impact ratio: quick wins first, structural changes last. Each item is a concrete task that can be assigned and tracked independently.

---

## Quick Wins (< 1 hour each)

**1. Remove `pytesseract` and `Pillow` from `requirements.txt`**
Neither package is imported anywhere. Remove both lines. This reduces install time and eliminates a dead dependency.

**2. Remove `anthropic` from `requirements.txt`**
Not imported anywhere in the Python codebase. Remove the line.

**3. Add `openai` to `requirements.txt`**
`services/ai_verifier.py` imports `openai` but it is not declared in the manifest. Add `openai>=1.0.0`. Without this, a fresh install breaks the AI verifier silently at runtime.

**4. Move `_norm()` to `normalizer.py` and remove the three copies**
The same text-normalization function (`lowercase + strip accents + collapse spaces`) exists in `services/geo_es.py:13`, `parsers/dhl_tarifa.py:103`, and `parsers/molartrans_tarifa.py:52`. Add one canonical `normalize_text(s: str) -> str` to `normalizer.py` and replace all three definitions with an import.

**5. Convert `SAP_CONECTADO` to an environment variable**
In `services/sap_client.py:21`, replace the hardcoded `False` with:
```python
import os
SAP_CONECTADO = os.getenv("SAP_ENABLED", "false").lower() == "true"
```
Add `SAP_ENABLED=false` to `.env.example`.

**6. Fix or remove `ecosystem.config.cjs`**
The `cwd` path references another machine. Either update it to use a relative path (`cwd: "."`) and fix the script reference, or delete the file if PM2 is not in use.

---

## Medium Tasks (half day each)

**7. Move `_build_report_excel()` from `views/carga.py` to `exports/exporter.py`**
`views/carga.py:181–336` builds a styled Excel report using `openpyxl`. This is export logic. Move it to `exports/exporter.py` alongside `export_excel()` and `export_csv()`. The view should call `exporter.build_report_excel(rows)`.

**8. Extract `_show_ai_result()` to its own module**
`views/carga.py:34–181` is a 145-line function that renders the AI verification result. Extract it to `views/components/ai_result.py` (or similar) so `views/carga.py` is not responsible for both the upload flow and the AI result display.

**9. Move province-escalation map into tariff rules JSON**
`parsers/molartrans_tarifa.py:28–33` hardcodes the postal-code-to-escalation mapping for Molartrans. Include this map in the tariff's `reglas_json` when parsing the tariff file, so it can be updated through the UI without touching source code.

**10. Add `OPENAI_API_KEY` presence check to `services/ai_verifier.py`**
Before calling `openai.OpenAI()`, check `os.getenv("OPENAI_API_KEY")` and raise a clear `RuntimeError` if it is missing. This surfaces the configuration problem at startup, not deep in a request.

---

## Structural Tasks (full day or more)

**11. Split `views/auditoria.py:render()` (511 lines) into sub-components**
This is the highest-priority structural change. The function mixes data loading, filtering, line-level display, summary cards, and export buttons. Extract each logical block into a named helper: `_render_filters()`, `_render_summary_cards()`, `_render_line_table()`, `_render_export_buttons()`. The top-level `render()` should be an orchestrator of under 50 lines.

**12. Move DB queries out of views into a service layer**
`views/simulador.py`, `views/auditoria.py`, `views/resultados.py`, and `views/carga.py` all open `SessionLocal()` directly. Create query functions in `services/` (e.g., `services/albaranes.py`, `services/tarifas_service.py`) and have views call those instead. This decouples the view from the ORM and makes business queries testable.

**13. Separate the TypeScript and Python apps into separate repositories (or at minimum separate directories)**
The two codebases (`src/` and the Python app) are unrelated products. Having them in the same repo makes the README misleading, `requirements.txt` ambiguous, and CI/CD harder. The minimum fix is to move the TypeScript code to a `doccia-ai/` subdirectory with its own README. The clean fix is a separate repository.

**14. Write unit tests for `services/tariff_engine.py`**
The tariff calculation functions (`_molartrans_escalado`, `_dhl_bultos_zona`, `_tdn_peso_baremo`, `_molartrans_nacional`) are complex business logic with no test coverage. A bug here means incorrect audit results. Add `tests/test_tariff_engine.py` with at least one test per calculation function using known input/output pairs from real invoices.
