> Last updated: 2026-06-30

# Business Rules

Core domain logic that the code must respect. These rules come from the transport
contracts with each agency — changing them requires validating against the agency's
current rate document.

---

## General rules

**An audit line is never modified after it is created.** The parser writes the agency's
data (albaran number, date, billed amount) as-is. The audit engine annotates the line
with `importe_calculado` and `diferencia`, but the original `importe_facturado` is
never changed. This preserves the ability to prove a discrepancy to the agency.

**A tariff must be active for the invoice date.** `tariff_engine.find_tariff()` filters
by `fecha_inicio` ≤ invoice date ≤ `fecha_fin`. A batch uploaded before the current
tariff is loaded will show no tariff found — not an error, a signal that the tariff
must be uploaded first.

**Unknown city is not a fatal error for DHL.** `services/geo_es.py` returns `None`
when a city cannot be resolved to a zone. The engine handles this gracefully and marks
the line as `SIN_TARIFA`.

---

## Molartrans

**Two tariff types exist on the same contract:**

1. **Escalado** — applies when the delivery postal code falls in `_CP_ESCALADO`
   (currently hardcoded in `parsers/molartrans_tarifa.py`). Price is determined by
   escalation tier and number of items.
2. **Nacional** — applies to all other postal codes. Price is a fixed rate per item.

**Albaran normalization for Molartrans:**
The agency invoice uses a 4-digit suffix reference. `normalizer.normalize_albaran()`
strips the leading `"3"` from Doccia's 9-digit SAP albaran, giving the 8-digit form
that Molartrans prints. The matching must account for this discrepancy.

---

## DHL Parcel

**Tariff is by bultos (packages) × zone:**
Each zone has a price table indexed by number of packages (1, 2, 3…). The zone is
resolved from the delivery city via `services/geo_es.py` → province → DHL zone.

**Fuel surcharge applies on top of base rate:**
`services/dhl_fuel.py` returns the fuel surcharge percentage for the invoice month.
The final amount is `base_rate × (1 + fuel_pct / 100)`.

**Product types pending:** Mamparas are implemented. Palets and espejos have different
rate structures that are not yet coded.

---

## TDN

**Tariff is by weight range (baremo) × zone:**
Each row defines a weight range and a price per kg for each destination zone.
`tariff_engine._tdn_peso_baremo()` finds the matching weight tier and multiplies.

---

## Estado (status) lifecycle

Each `Albaran` line ends up in one of these states after audit:

| Status | Meaning |
|---|---|
| `CORRECTO` | Calculated amount matches billed amount (within rounding tolerance) |
| `DIFERENCIA` | Calculated amount differs from billed amount |
| `SIN_TARIFA` | No active tariff found for this agency and date |
| `ERROR` | Parsing or calculation error; review manually |

**Rounding tolerance:** Two amounts are considered equal if `abs(facturado - calculado) < 0.01`.
This is implicit in the comparison logic and must not be tightened — agencies round differently.

---

## Albaran reference matching

Doccia's internal reference (albaran number) appears in different formats depending
on the agency:

| Agency | Doccia format (SAP) | Agency format | Transformation |
|---|---|---|---|
| Molartrans | 9 digits starting with `3` (e.g. `300012345`) | 8 digits (e.g. `00012345`) | Strip leading `3` |
| TDN | Full albaran | Full albaran | No change |
| DHL Parcel | Full albaran | Full albaran | No change |

`normalizer.normalize_albaran(row, agency)` handles these transformations.
Adding a new agency requires updating this function.

---

## SAP integration rules

`services/sap_client.py` is the planned integration point for SAP data (postal codes,
weights, reference numbers). Until it is live (`SAP_CONECTADO = True`), the system
reads `data/sap_overrides.json`, a manually maintained JSON file where the operations
team enters the data that SAP would otherwise provide.

Format of `sap_overrides.json`:
```json
{
  "300012345": {"cp": "28001", "peso": 15.2}
}
```
Key is the Doccia albaran number. Values override what the parser extracts.
