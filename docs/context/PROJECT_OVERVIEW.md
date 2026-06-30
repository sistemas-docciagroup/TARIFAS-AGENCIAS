> Last updated: 2026-06-30

# Project Overview

## What it is

**Transportes Doccia Group** is an internal Streamlit web application that automates
the auditing of freight invoices from external transport agencies. Each month, agencies
send invoices (PDF or Excel) listing individual shipments with their billed amounts.
The system parses those invoices, crosses each line against the contracted tariff, and
flags discrepancies so the operations team can dispute incorrect charges.

## Why it exists

Doccia Group ships physical products (mirrors, shower screens, pallets) through 6
external agencies. Invoice checking was done manually in spreadsheets — slow, error-prone,
and impossible to scale. This app reduces that to: upload the invoice file → review
flagged differences → export for SAP.

## Who uses it

Internal operations/finance team at Doccia Group. No external users, no public API.

## Current status (2026-06-30)

| Agency | Parser | Tariff | Status |
|---|---|---|---|
| Molartrans | ✅ Production | ✅ Auto-extracted from PDF | Validated |
| DHL Parcel | ✅ Production | ✅ Auto-extracted from Excel (mamparas) | In development — palets/espejos pending |
| TDN | ✅ Production | ✅ Auto-extracted from PDF | Validated |
| DHL Freight | ⚠️ Partial | ❌ Pending | In development |
| CEVA | ⚠️ Partial | ❌ Pending | In development |
| DSV | ⚠️ Partial | ❌ Pending | In development |

SAP integration is stubbed — currently uses a manual override file (`data/sap_overrides.json`)
to supply postal codes and weights that SAP would eventually provide.

## Key design decisions

- **No live Zendesk integration yet.** There is a separate TypeScript codebase (`src/`) for a
  Zendesk AI assistant. It is a different product, not part of the Streamlit app, and should
  be treated as a separate project sharing the same repository.
- **Tariff rules stored as JSON in SQLite.** Each tariff upload parses the agency's rate
  document and stores structured rules in `Tarifa.reglas_json`. The calculation engine reads
  these rules at runtime — no hardcoded tariff tables (with the exception of Molartrans
  province escalation, which is a known debt).
- **AI verification via GPT-4o Vision.** After parsing a PDF invoice, users can trigger an
  optional AI check that sends page images to GPT-4o to validate that the extracted totals
  match the PDF. This is a confidence check, not the primary audit.
- **Read-only audit philosophy.** The app never modifies agency invoice data. It only annotates
  each line with the calculated expected amount and flags the difference.
