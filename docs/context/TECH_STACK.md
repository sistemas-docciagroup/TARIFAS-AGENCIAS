> Last updated: 2026-06-30

# Tech Stack

## Python App (main product)

| Component | Choice | Why |
|---|---|---|
| **Language** | Python 3.14 | Team familiarity; rich PDF/Excel ecosystem |
| **UI framework** | Streamlit ≥ 1.35 | Fastest path to an internal data app; no frontend dev needed |
| **ORM / DB** | SQLAlchemy 2.x + SQLite | Single-user internal tool; no concurrent writes; zero config |
| **PDF parsing** | pdfplumber ≥ 0.11 | Better structured-text extraction than PyMuPDF for table-like PDFs |
| **PDF images** | PyMuPDF (fitz) ≥ 1.24 | Renders PDF pages to images for GPT-4o Vision checks |
| **Excel parsing** | pandas ≥ 2.2 + openpyxl ≥ 3.1 | Industry standard for spreadsheet work |
| **Charts** | plotly ≥ 5.22 | Interactive charts in Streamlit with minimal boilerplate |
| **AI verification** | openai (GPT-4o Vision) | Validates extracted invoice data against PDF page images |
| **Config** | python-dotenv ≥ 1.0 | `.env` file for `OPENAI_API_KEY` and future secrets |

### Declared but unused (cleanup pending)

- `pytesseract` — OCR library, never imported
- `Pillow` — image processing, never imported (PyMuPDF handles page rendering)
- `anthropic` — Anthropic SDK, never imported (uses OpenAI instead)

### Used but undeclared (must add)

- `openai` — imported in `services/ai_verifier.py`; missing from `requirements.txt`

---

## TypeScript App (separate product in same repo)

| Component | Choice |
|---|---|
| **Runtime** | Node.js / Bun |
| **Framework** | Fastify |
| **Language** | TypeScript |
| **Purpose** | Zendesk AI customer service assistant (different product) |

Not part of the Streamlit tariff system. Lives in `src/`. Has its own `package.json`.

---

## Infrastructure

| Concern | Current state |
|---|---|
| **Process manager** | PM2 (`ecosystem.config.cjs`) — broken, hardcodes `C:/Users/alfonsop/` path |
| **Database** | SQLite file at `data/transportes.db` — not committed to git |
| **File storage** | Local `data/tarifas/` directory — not committed to git |
| **SAP** | Stub — reads `data/sap_overrides.json` until real integration is built |
| **AI costs** | Per-request GPT-4o Vision calls, triggered manually by user |

---

## Development environment

- **OS:** Windows (primary). Code uses forward slashes in most places.
- **Python install path:** `py -3.14` (Windows py launcher)
- **Start command:** `py -3.14 -m streamlit run app.py`
- **Claude Code:** Available via `.claude/settings.json` with Ponytail plugin enabled.
