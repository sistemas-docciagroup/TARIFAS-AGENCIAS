> Last updated: 2026-06-30

# Coding Standards

Patterns actually used in the codebase, derived from reading the source.

---

## File and module conventions

**Each view is a module with a single `render()` function.** `app.py` calls
`views.<page>.render()` for the active page. Views do not export any other public
symbol. Streamlit session state is managed inside `render()`.

**Parsers export a class that inherits from `BaseParser`.** The class name is
`<AgencyName>Parser` (e.g. `MolartransParser`). `parsers/__init__.py` registers
each class in `PARSERS = {"AgencyName": AgencyNameParser, ...}`.

**Tariff parsers are separate files named `<agency>_tarifa.py`.** They export a
`parse(file_path: str) -> dict` function that returns a `reglas_json`-compatible dict.
They are not in `PARSERS` — they are called directly from `views/tarifas.py`.

---

## Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `snake_case` | `tariff_engine.py`, `dhl_parcel.py` |
| Classes | `PascalCase` | `MolartransParser`, `Albaran` |
| Functions | `snake_case` | `find_tariff()`, `normalize_albaran()` |
| Private helpers | `_leading_underscore` | `_norm()`, `_molartrans_escalado()` |
| Constants | `UPPER_SNAKE` | `SAP_CONECTADO`, `PARSERS`, `AGENCY_META` |
| DB columns | `snake_case` | `importe_facturado`, `fecha_carga` |
| Streamlit state keys | `snake_case` strings | `st.session_state["batch_id"]` |

---

## Error handling patterns

**At parsing boundaries (user-uploaded files):** errors are caught and shown as
`st.error()` messages. The view recovers gracefully; no exception propagates to
Streamlit's default error screen.

**Inside services and parsers:** errors are allowed to propagate. The view layer
catches them. Don't add `try/except` inside services unless recovering from a specific,
known failure mode.

**Safe extractors in `BaseParser`:** use `self.safe_float(val)`, `self.safe_int(val)`,
`self.safe_date(val)` instead of `float(val)` / `int(val)`. These return `None` on
failure rather than raising, and the caller decides how to handle missing data.

---

## Database access

**Always use `SessionLocal()` inside a `try/finally` block:**

```python
db = SessionLocal()
try:
    rows = db.query(Albaran).filter(...).all()
finally:
    db.close()
```

**Do not use `with Session()` context manager** — the existing code uses try/finally
throughout; keep consistency.

**Known violation:** Several views open `SessionLocal()` without going through a service
function. New code should put DB queries in `services/`, not directly in `views/`.

---

## normalizer.py — the normalization contract

All text cleaning goes through `normalizer.py`. Never implement a `_norm()` or
equivalent inline in a parser or service — add it to `normalizer.py` and import it.

```python
from normalizer import normalize_float, normalize_date, normalize_albaran
```

`normalize_albaran(row: dict, agency: str) -> str` is the entry point for reference
number normalisation. It reads `agency` to apply agency-specific transformations.

---

## agency_meta.py — the agency registry

`parsers/agency_meta.py` is the single source of truth for:
- What keywords appear in each agency's files (`KEYWORDS`)
- The current validation status of each agency
- Which tariff types each agency uses
- Column name definitions per agency

Do not hardcode agency names or keywords in parsers or views. Use `AGENCY_META`.

---

## reglas_json structure

Each `Tarifa` row has a `reglas_json` column (JSON string) that stores the parsed
tariff rules. The structure varies by `tipo_tarifa`:

```json
// tipo_tarifa: "dhl_bultos_zona"
{
  "tipo_tarifa": "dhl_bultos_zona",
  "zonas": {
    "Z1": {"1": 5.20, "2": 6.10, "3": 6.80},
    "Z2": {"1": 6.00, "2": 7.20, "3": 8.00}
  }
}

// tipo_tarifa: "tdn_peso_baremo"
{
  "tipo_tarifa": "tdn_peso_baremo",
  "baremos": [
    {"hasta_kg": 5, "zonas": {"A": 4.50, "B": 5.20}},
    {"hasta_kg": 10, "zonas": {"A": 6.00, "B": 7.10}}
  ]
}
```

`tariff_engine.calculate_expected_amount()` dispatches to the right calculation
function based on `reglas_json["tipo_tarifa"]`.
