# Architecture Report

The repository contains two completely independent applications sharing the same root directory: a Python/Streamlit transport-rate audit system (`app.py` + `views/`, `parsers/`, `services/`, `database/`, `exports/`) and a TypeScript/Node.js Zendesk AI customer-service system (`src/`). The README describes only the TypeScript app, while the Streamlit app is the one actually in use. Within the Python app, the layered structure is sound and consistent, but several responsibilities have leaked between layers.

---

## Finding 1 — Two unrelated codebases in the same repo

**Files:** `app.py`, `src/server.ts`

The Python Streamlit app and the TypeScript Fastify app are completely independent — they share no code, no database, and no configuration. Keeping them in the same repo creates confusion about which is the real product, which README to trust, and which dependencies belong to which app. The TypeScript codebase appears to be a prototype of a different product (Zendesk AI assistant).

## Finding 2 — README describes the wrong application

**File:** `README.md`

The README documents the TypeScript app (`Doccia AI` for Zendesk) but the actual entry point is `app.py` (the Streamlit tariff management system). A developer cloning this repo has no documentation for the app they will actually run.

## Finding 3 — `ecosystem.config.cjs` hardcodes a path from another machine

**File:** `ecosystem.config.cjs:7`

```js
cwd: "C:/Users/alfonsop/Documents/doccia-ai",
```

This PM2 config references a path on a different developer's machine (`alfonsop`). It will never work on any other machine and should either be updated to use a relative path or removed.

## Finding 4 — DB queries in views (architecture layer violation)

**Files:** `views/simulador.py:14–18`, `views/auditoria.py`, `views/resultados.py`, `views/carga.py`

Multiple view files open `SessionLocal()` directly and query the database. Persistence logic should be isolated in `services/` or `database/` — views should only call service functions. This makes the views harder to test and creates implicit coupling to the database schema.

**Example:** `views/simulador.py:14`
```python
db0 = SessionLocal()
try:
    tipologias = [t[0] for t in db0.query(Tarifa.tipologia)...
```

## Finding 5 — Excel export logic inside a view

**File:** `views/carga.py:181–336` (`_build_report_excel()`, 156 lines)

The function builds a styled Excel workbook with `openpyxl`. This is export logic that belongs in `exports/exporter.py`, which already exists for exactly this purpose. Its presence in a view file breaks the single-responsibility boundary and duplicates concerns already established in the exports layer.

## Finding 6 — `_norm()` text normalization defined three times

**Files:**
- `services/geo_es.py:13`
- `parsers/dhl_tarifa.py:103`
- `parsers/molartrans_tarifa.py:52` (named `_norm_zona`)

All three implement the same logic: lowercase a string, replace accented characters with ASCII equivalents, collapse whitespace. This belongs in `normalizer.py`, which is already the declared single source of truth for normalization utilities.

## Finding 7 — Naming inconsistency: `_tarifa` suffix parsers

**Files:** `parsers/dhl_tarifa.py`, `parsers/molartrans_tarifa.py`

These two files parse tariff files (Excel/PDF) and produce rule structures. The remaining parsers (`dhl_parcel.py`, `molartrans.py`, etc.) parse invoice files. The naming is correct but the distinction is not documented — it is easy to confuse "invoice parser" with "tariff parser" because they share the `parsers/` folder without a subfolder separator.
