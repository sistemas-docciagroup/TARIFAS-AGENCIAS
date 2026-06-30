# Pending Tasks — Project Audit (2026-06-30)

Resultados de la primera ejecución de `/project-audit`. Los cinco informes detallados
están en este mismo directorio. Esta lista resume las tareas pendientes para retomarlas.

---

## Quick Wins (< 1 hora cada una)

- [ ] **1.** Eliminar `pytesseract` y `Pillow` de `requirements.txt` — no se importan en ningún lado.
- [ ] **2.** Eliminar `anthropic` de `requirements.txt` — no se importa; el código usa `openai`.
- [ ] **3.** Añadir `openai` a `requirements.txt` — se usa en `services/ai_verifier.py:45` pero no está declarado.
- [ ] **4.** Consolidar `_norm()` en `normalizer.py` y eliminar las 3 copias en `services/geo_es.py:13`, `parsers/dhl_tarifa.py:103`, `parsers/molartrans_tarifa.py:52`.
- [ ] **5.** Convertir `SAP_CONECTADO = False` (`services/sap_client.py:21`) en variable de entorno `SAP_ENABLED`.
- [ ] **6.** Corregir o eliminar `ecosystem.config.cjs` — apunta a `C:/Users/alfonsop/` (otra máquina).

## Tareas medianas (medio día cada una)

- [ ] **7.** Mover `_build_report_excel()` (`views/carga.py:181–336`) a `exports/exporter.py`.
- [ ] **8.** Extraer `_show_ai_result()` (`views/carga.py:34–181`) a su propio módulo.
- [ ] **9.** Mover el mapa CP→escalado de Molartrans del código fuente al `reglas_json` de la tarifa.
- [ ] **10.** Añadir check de `OPENAI_API_KEY` al inicio de `services/ai_verifier.py`.

## Tareas estructurales (un día o más)

- [ ] **11.** Dividir `views/auditoria.py:render()` (511 líneas) en sub-componentes.
- [ ] **12.** Mover queries de BD fuera de las views (`simulador`, `auditoria`, `resultados`, `carga`) a una capa de servicio.
- [ ] **13.** Separar la app TypeScript (`src/`) de la app Python — repositorios distintos o al menos subdirectorios separados con su propio README.
- [ ] **14.** Escribir tests unitarios para `services/tariff_engine.py` (sin cobertura actual).

---

## Informes de detalle

- [architecture-report.md](architecture-report.md)
- [dead-code.md](dead-code.md)
- [dependency-report.md](dependency-report.md)
- [technical-debt.md](technical-debt.md)
- [improvement-plan.md](improvement-plan.md)
