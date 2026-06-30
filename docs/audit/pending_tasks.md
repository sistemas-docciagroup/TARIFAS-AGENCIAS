# Pending Tasks — Project Audit (2026-06-30)

Results from the first `/project-audit` run. The five detailed reports are in this
same directory. This checklist summarises the pending tasks for later pickup.

---

## Quick Wins (< 1 hour each)

- [x] **1.** Remove `pytesseract` and `Pillow` from `requirements.txt` — never imported anywhere. *(done 2026-06-30)*
- [x] **2.** Remove `anthropic` from `requirements.txt` — never imported; code uses `openai` instead. *(done 2026-06-30)*
- [ ] **3.** Add `openai` to `requirements.txt` — used in `services/ai_verifier.py:45` but not declared.
- [ ] **4.** Consolidate `_norm()` into `normalizer.py` and remove the 3 copies in `services/geo_es.py:13`, `parsers/dhl_tarifa.py:103`, `parsers/molartrans_tarifa.py:52`.
- [x] **5.** Convert `SAP_CONECTADO = False` (`services/sap_client.py:21`) to env var `SAP_ENABLED`. *(done 2026-06-30)*
- [ ] **6.** Fix or remove `ecosystem.config.cjs` — hardcodes `C:/Users/alfonsop/` (another machine).

## Medium Tasks (half day each)

- [ ] **7.** Move `_build_report_excel()` (`views/carga.py:181–336`) to `exports/exporter.py`.
- [ ] **8.** Extract `_show_ai_result()` (`views/carga.py:34–181`) to its own module.
- [ ] **9.** Move the Molartrans CP→escalation map from source code into the tariff's `reglas_json`.
- [ ] **10.** Add `OPENAI_API_KEY` presence check at the start of `services/ai_verifier.py`.

## Structural Tasks (full day or more)

- [ ] **11.** Split `views/auditoria.py:render()` (511 lines) into sub-components.
- [ ] **12.** Move DB queries out of views (`simulador`, `auditoria`, `resultados`, `carga`) into a service layer.
- [ ] **13.** Separate the TypeScript app (`src/`) from the Python app — separate repos or at minimum separate directories with their own README.
- [ ] **14.** Write unit tests for `services/tariff_engine.py` (no coverage currently).

---

## Detailed reports

- [architecture-report.md](architecture-report.md)
- [dead-code.md](dead-code.md)
- [dependency-report.md](dependency-report.md)
- [technical-debt.md](technical-debt.md)
- [improvement-plan.md](improvement-plan.md)
