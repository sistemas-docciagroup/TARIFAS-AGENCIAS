> Last updated: 2026-06-30

# API Reference

This is a Streamlit app with no HTTP API. "API" here means the public Python interfaces
between layers — the functions other modules actually call.

---

## `services/tariff_engine.py`

The calculation core. Everything else calls this.

### `find_tariff(db, agencia: str, fecha: date) -> Tarifa | None`
Returns the active `Tarifa` for the given agency and date, or `None` if none exists.
Matches on `agencia`, `fecha_inicio ≤ fecha ≤ fecha_fin`.

### `calculate_expected_amount(albaran: Albaran, tarifa: Tarifa) -> float | None`
Dispatches to the agency-specific calculation function based on
`tarifa.reglas_json["tipo_tarifa"]`. Returns `None` if calculation is not possible
(e.g. city not found in geo lookup).

### `compare_amounts(albaran: Albaran, tarifa: Tarifa, db) -> None`
Runs `find_tariff` + `calculate_expected_amount`, then writes `importe_calculado`,
`diferencia`, and `estado_tarifa` back to the `Albaran` record and commits.

---

## `services/ai_verifier.py`

### `verify_invoice(batch_id: str, pdf_path: str, db) -> dict`
Sends each page of `pdf_path` as a base64 image to GPT-4o Vision with the extracted
lines for that page. Returns a dict with per-line verification results. Writes results
to `Albaran.ai_resultado`. Requires `OPENAI_API_KEY` env var.

---

## `services/geo_es.py`

### `ciudad_a_zona_dhl(ciudad: str) -> str | None`
Resolves a city name to a DHL zone string (e.g. `"Z1"`, `"Z2"`). Returns `None`
if the city is not in the lookup table. Case-insensitive, accent-tolerant.

---

## `services/sap_client.py`

### `get_datos_sap(albaran: str, agencia: str) -> dict | None`
Returns SAP data (CP, peso, etc.) for the given albaran. Currently reads from
`data/sap_overrides.json`. Returns `None` if not found.

Activate real SAP: set `SAP_ENABLED=true` in `.env` and implement `_fetch_from_sap()`.

---

## `services/dhl_fuel.py`

### `get_fuel_pct(year: int, month: int) -> float`
Returns the DHL fuel surcharge percentage for the given year/month. Reads from
`data/dhl_fuel.json`. Returns `0.0` if the month is not in the file.

### `set_fuel_pct(year: int, month: int, pct: float) -> None`
Saves a fuel surcharge percentage to `data/dhl_fuel.json`.

---

## `normalizer.py`

Pure functions. No side effects. No imports from the rest of the project.

### `normalize_albaran(row: dict, agency: str) -> str`
Extracts and normalises the Doccia albaran reference from a parsed invoice row,
applying agency-specific transformation rules.

### `normalize_date(val) -> date | None`
Parses a date from string, datetime, or Excel serial. Returns `None` on failure.

### `normalize_float(val) -> float | None`
Converts a value to float, handling Spanish decimal comma notation. Returns `None` on failure.

### `normalize_int(val) -> int | None`
Converts a value to int. Returns `None` on failure.

---

## `parsers/` — Parser interface

All invoice parsers implement `BaseParser`:

### `BaseParser.parse(file_path: str) -> list[dict]`
Parses an invoice file and returns a list of raw row dicts. Each dict contains the
fields defined in `agency_meta.AGENCY_META[agency]["columns"]`.

### `BaseParser.empty_row() -> dict`
Returns a row dict with all fields set to `None`. Used to initialise a row before
field extraction.

---

## `exports/exporter.py`

### `export_excel(rows: list[dict], output_path: str) -> None`
Writes a styled Excel workbook with the given rows to `output_path`.

### `export_csv(rows: list[dict], output_path: str) -> None`
Writes a CSV file with the given rows to `output_path`.

---

## `parsers/detector.py`

### `detect_agency(file_path: str) -> str | None`
Reads the first pages/rows of a file and matches against `AGENCY_META` keywords.
Returns the agency name string (e.g. `"Molartrans"`) or `None` if not recognised.

---

## Streamlit pages (views)

Each page exports one function:

### `views/<page>.render() -> None`
Renders the full page. Called by `app.py`. No arguments — reads from Streamlit
session state and URL query params internally.

Pages: `carga`, `resultados`, `auditoria`, `tarifas`, `reglas`, `simulador`, `dashboard`.
