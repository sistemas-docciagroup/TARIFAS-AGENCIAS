> Last updated: 2026-06-30

# Architecture

## System overview

Single-process Streamlit app backed by SQLite. No background workers, no queues, no
separate API server. All processing happens in the Streamlit request/response cycle.

```
User (browser)
    │
    ▼
app.py  ──── sidebar navigation ────► views/
    │                                   ├── carga.py        (upload & parse)
    │                                   ├── resultados.py   (browse results)
    │                                   ├── auditoria.py    (cross with tariff)
    │                                   ├── tarifas.py      (manage rate cards)
    │                                   ├── reglas.py       (agency rules display)
    │                                   ├── simulador.py    (rate calculator)
    │                                   └── dashboard.py    (summary stats)
    │
    ▼
services/                            parsers/
├── tariff_engine.py  (calculate)    ├── molartrans.py     (PDF invoice)
├── ai_verifier.py    (GPT-4o)       ├── dhl_parcel.py     (PDF invoice)
├── geo_es.py         (city→zone)    ├── dhl_freight.py    (PDF invoice)
├── sap_client.py     (stub)         ├── tdn.py            (Excel invoice)
├── dhl_fuel.py       (fuel %)       ├── ceva.py           (Excel/CSV)
└── file_storage.py   (save files)   ├── dsv.py            (Excel/CSV)
                                     ├── dhl_tarifa.py     (Excel tariff)
                                     ├── molartrans_tarifa.py (PDF tariff)
                                     ├── tdn_tarifa.py     (PDF tariff)
                                     ├── detector.py       (agency detection)
                                     ├── agency_meta.py    (single source of truth)
                                     └── base_parser.py    (ABC)
database/
├── db.py             (engine + SessionLocal)
└── models.py         (Albaran, Tarifa, EstadoTarifa)

exports/
└── exporter.py       (Excel + CSV export)

normalizer.py         (shared parse utilities)
```

## Data flow — invoice upload

1. User uploads PDF/Excel in `views/carga.py`
2. `parsers/detector.py` reads first 5 pages to identify the agency
3. The matching parser (`parsers/<agency>.py`) extracts rows into `list[dict]`
4. `normalizer.normalize_albaran()` standardises the Doccia reference per agency rules
5. Rows are saved as `Albaran` records in SQLite
6. Optional: user triggers AI verification (`services/ai_verifier.py` → GPT-4o Vision)

## Data flow — tariff audit

1. User opens `views/auditoria.py` and selects a batch
2. For each `Albaran`, `services/tariff_engine.find_tariff()` finds the active `Tarifa`
3. `tariff_engine.calculate_expected_amount()` applies the tariff rules (dispatches to
   agency-specific function based on `reglas_json.tipo_tarifa`)
4. `tariff_engine.compare_amounts()` computes the difference and sets `estado_tarifa`
5. Results are persisted back to the `Albaran` record

## Layer boundaries

| Layer | Responsibility | May call |
|---|---|---|
| `views/` | UI rendering, user input, session state | `services/`, `database/`, `exports/`, `parsers/` |
| `services/` | Business logic, calculations, external calls | `database/`, `normalizer` |
| `parsers/` | File parsing only, no DB | `normalizer` |
| `database/` | ORM models, session factory | nothing above |
| `exports/` | File generation | nothing above |
| `normalizer.py` | Pure string/number conversion | nothing |

**Known violation:** `views/` currently opens `SessionLocal()` directly in several places
instead of delegating to `services/`. This is tracked as technical debt.
