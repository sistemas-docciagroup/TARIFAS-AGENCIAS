> Last updated: 2026-06-30

# Folder Structure

```
TARIFAS AGENCIAS/
│
├── app.py                      Entry point. Streamlit page config + sidebar nav.
├── normalizer.py               Shared pure utilities: normalize_albaran, normalize_date,
│                               normalize_float, normalize_int.
├── requirements.txt            Python dependencies (see TECH_STACK.md).
├── .env.example                Environment variable template.
├── CLAUDE.md                   Claude Code setup instructions for the team.
│
├── views/                      One file per Streamlit page. Each exports render().
│   ├── carga.py                Invoice upload, agency detection, parsing, AI verification.
│   ├── resultados.py           Browse and filter parsed invoice lines.
│   ├── auditoria.py            Cross invoice lines against tariffs, show differences.
│   ├── tarifas.py              Upload and manage tariff rate cards.
│   ├── reglas.py               Display agency processing rules (from agency_meta.py).
│   ├── simulador.py            Interactive rate calculator using live tariff rules.
│   └── dashboard.py            Summary metrics and charts.
│
├── parsers/                    File parsers. Two sub-types:
│   ├── agency_meta.py          SINGLE SOURCE OF TRUTH for agency keywords, status,
│   │                           column definitions, and tariff type per agency.
│   ├── detector.py             Detects agency from file text/name using agency_meta.KEYWORDS.
│   ├── base_parser.py          Abstract base class with empty_row(), safe_float(), etc.
│   ├── __init__.py             PARSERS dict mapping agency name → parser class.
│   │
│   │   ── Invoice parsers (parse agency invoice files → list[dict]) ──
│   ├── molartrans.py           Molartrans PDF invoices (position-based column extraction).
│   ├── dhl_parcel.py           DHL Parcel PDF invoices.
│   ├── dhl_freight.py          DHL Freight PDF invoices.
│   ├── tdn.py                  TDN Excel invoices (.xls that is actually .xlsx).
│   ├── ceva.py                 CEVA Excel/CSV invoices.
│   └── dsv.py                  DSV Excel/CSV invoices.
│
│       ── Tariff parsers (parse agency rate documents → rules dict for reglas_json) ──
│   ├── dhl_tarifa.py           DHL Parcel Excel tariff → dhl_bultos_zona rules.
│   ├── molartrans_tarifa.py    Molartrans PDF tariff → molartrans_escalados / molartrans_nacional.
│   └── tdn_tarifa.py           TDN PDF tariff → tdn_peso_baremo rules.
│
├── services/                   Business logic. No UI code.
│   ├── tariff_engine.py        Core: find_tariff(), calculate_expected_amount(),
│   │                           compare_amounts(). Dispatches to agency-specific functions.
│   ├── ai_verifier.py          GPT-4o Vision invoice verification (optional, on-demand).
│   ├── geo_es.py               City/province resolution for DHL zone lookup.
│   ├── sap_client.py           SAP integration stub. Currently reads data/sap_overrides.json.
│   ├── dhl_fuel.py             DHL fuel surcharge % by month. Reads/writes data/dhl_fuel.json.
│   └── file_storage.py         Saves uploaded files to data/tarifas/ with timestamp prefix.
│
├── database/
│   ├── db.py                   SQLAlchemy engine + SessionLocal factory. DB at data/transportes.db.
│   └── models.py               Albaran and Tarifa ORM models + EstadoTarifa enum.
│
├── exports/
│   └── exporter.py             export_excel() and export_csv() with styled openpyxl output.
│
├── data/                       Runtime data — excluded from git.
│   ├── transportes.db          SQLite database (albaranes + tarifas).
│   ├── tarifas/                Uploaded tariff files (timestamped copies).
│   ├── attachments/            Zendesk ticket attachments (separate product).
│   └── dhl_fuel.json           DHL fuel % by month. Manually maintained.
│   └── sap_overrides.json      Manual CP/weight overrides until SAP is connected.
│
├── docs/
│   ├── context/                Permanent project knowledge base (this directory).
│   └── audit/                  Audit reports from /project-audit runs.
│
├── src/                        SEPARATE PRODUCT. TypeScript/Node.js Zendesk AI assistant.
│                               Not part of the Streamlit tariff app. Has its own README.
│
└── .claude/
    └── skills/                 Project skills shared with the team via git.
        ├── project-audit/      /project-audit — full codebase audit.
        ├── project-context/    /project-context — generates this docs/context/ directory.
        └── skill-creator/      /skill-creator — create and improve skills.
```
