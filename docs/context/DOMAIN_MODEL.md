> Last updated: 2026-06-30

# Domain Model

## Core entities

### Albaran (invoice line)

Represents one shipment line from a transport agency's invoice.

| Column | Type | Description |
|---|---|---|
| `id` | Integer PK | Auto-increment |
| `agencia` | String | Agency name (matches `AGENCY_META` key) |
| `numero_albaran` | String | Doccia's internal shipment reference (normalised) |
| `fecha_albaran` | Date | Shipment date from the invoice |
| `fecha_carga` | DateTime | When this batch was uploaded |
| `batch_id` | String | Groups all lines from the same upload session |
| `importe_facturado` | Float | Amount billed by the agency |
| `importe_calculado` | Float\|None | Amount the system calculated from the tariff |
| `diferencia` | Float\|None | `importe_calculado - importe_facturado` |
| `estado_tarifa` | EstadoTarifa | Audit status (see lifecycle below) |
| `raw_data` | JSON | All fields extracted by the parser (agency-specific) |
| `ai_resultado` | JSON\|None | GPT-4o verification result, if triggered |

**`raw_data` contents** are agency-specific. Common fields:

```python
{
  "destinatario": "FERRETERÍA PÉREZ SL",
  "cp_destino": "28001",
  "ciudad_destino": "Madrid",
  "bultos": 3,
  "peso": 12.5,
  "referencia_agencia": "DHL-20241101-0042"
}
```

### Tarifa (rate card)

Represents one uploaded tariff document for an agency.

| Column | Type | Description |
|---|---|---|
| `id` | Integer PK | Auto-increment |
| `agencia` | String | Agency name |
| `tipo_tarifa` | String | Tariff calculation type (`dhl_bultos_zona`, `tdn_peso_baremo`, etc.) |
| `fecha_inicio` | Date | First date this tariff applies |
| `fecha_fin` | Date | Last date this tariff applies (can be far future) |
| `archivo_original` | String | Filename of the uploaded rate document |
| `reglas_json` | JSON | Parsed tariff rules (structure varies by `tipo_tarifa`) |
| `fecha_carga` | DateTime | When this tariff was uploaded |

### EstadoTarifa (enum)

```python
class EstadoTarifa(enum.Enum):
    CORRECTO  = "CORRECTO"    # amounts match within tolerance
    DIFERENCIA = "DIFERENCIA" # calculated ≠ billed
    SIN_TARIFA = "SIN_TARIFA" # no active tariff found
    ERROR     = "ERROR"       # parsing or calculation failed
```

---

## Entity relationships

```
Tarifa (1)  ──────────────────────────────  is found by find_tariff()
                                              │
Albaran (*) ─── agencia + fecha_albaran ──────┘
            ─── has 0 or 1 ─────────────────  importe_calculado + estado_tarifa
```

There is no foreign key between `Albaran` and `Tarifa` in the database — the
relationship is resolved at query time by `tariff_engine.find_tariff()`.

---

## Batch concept

Every upload creates a `batch_id` (UUID string). All `Albaran` rows from that upload
share the same `batch_id`. The UI uses `batch_id` to:
- Show results for a specific upload session
- Trigger AI verification for all lines in a batch
- Export results for a specific batch to Excel/CSV

---

## Key value objects (in `raw_data`)

These are not separate DB entities — they exist as keys inside `Albaran.raw_data`:

| Concept | Key in raw_data | Used by |
|---|---|---|
| Delivery postal code | `cp_destino` | `geo_es.py` zone lookup |
| Package count | `bultos` | DHL bultos tariff |
| Weight | `peso` | TDN baremo tariff |
| SAP albaran (normalised) | `numero_albaran` (top-level column) | SAP matching |

---

## Tariff type dispatch table

| `tipo_tarifa` value | Agencies | Calculation function |
|---|---|---|
| `molartrans_escalado` | Molartrans | `_molartrans_escalado()` |
| `molartrans_nacional` | Molartrans | `_molartrans_nacional()` |
| `dhl_bultos_zona` | DHL Parcel | `_dhl_bultos_zona()` |
| `tdn_peso_baremo` | TDN | `_tdn_peso_baremo()` |
