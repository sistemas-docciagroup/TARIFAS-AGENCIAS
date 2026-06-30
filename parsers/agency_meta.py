"""
Fuente ÚNICA de verdad de las reglas de proceso por agencia.

La usa tanto el detector (palabras clave de detección) como la pestaña
"Reglas de proceso" (transparencia/estado). Así la documentación que ve el
usuario nunca se desincroniza de lo que el código hace de verdad.

estado:
  · "validado"   → parser probado con facturas reales y tarifa operativa
  · "desarrollo" → parser implementado, pendiente de validar / sin tarifa
  · "pendiente"  → aún sin parser
"""

AGENCY_META: dict[str, dict] = {
    "Molartrans": {
        "estado": "validado",
        "keywords": ["MOLARTRANS", "B90163791", "molartrans"],
        "formatos": ["PDF"],
        "extraccion": "Tabla de albaranes leída por posición X de cada columna "
                      "(no por orden), para no desplazar columnas vacías. El TOTAL "
                      "es siempre el último importe con € de la línea.",
        "columnas": ["Portes", "RC (combustible)", "Seguro", "Contrareembolso", "Total"],
        "reglas_especiales": [
            "RC = recargo de combustible (≈7% del porte).",
            "Contrareembolso = 2,5% del valor declarado (solo envíos con reembolso).",
            "Si no hay peso → se estima el tramo por bultos (30 kg/bulto: 1→30, 2→60, 3→90).",
            "Tipo y kg se extraen del detalle pese a que pdfplumber fusiona 'Tipo' con 'Orig'.",
        ],
        "tarifa": "Escalados por provincia de destino — ESC1 Sevilla · ESC2 Cádiz/Huelva/"
                  "Córdoba/Málaga · ESC3 Jaén/Granada/Almería. Materiales MAMPARA/PALETS "
                  "por tramos de kg. Cobertura solo Andalucía (resto → sin tarifa).",
        "tipo_tarifa": "molartrans_escalados",
        "compara_contra": "Portes (base de transporte, sin seguro ni contrareembolso)",
        "tarifa_auto": "Sí — al subir el PDF de tarifa se generan las reglas automáticamente.",
    },
    "DHL Parcel": {
        "estado": "desarrollo",
        "keywords": ["DHL Parcel", "dhl-parcel", "DHL PARCEL", "dhlparcel"],
        "formatos": ["PDF", "Excel", "CSV"],
        "extraccion": "Factura PDF leída por posición X de columnas (igual que Molartrans), "
                      "porque Seguro/Reexped/Otros pueden venir vacías. Validado al céntimo "
                      "contra los totales declarados en la factura.",
        "columnas": ["Expedición", "Destino", "Consignatario", "Su referencia (→albarán)",
                     "Bultos", "Kilos", "Portes", "Seguro", "Reexpedición", "Otros", "Total"],
        "reglas_especiales": [
            "'Su referencia' = referencia Doccia → se normaliza a albarán Doccia.",
            "Incluye expediciones de salida y de llegada (devoluciones).",
        ],
        "tarifa": "Por producto (tipología). MAMPARAS = nº bultos × zona (operativo): la zona "
                  "sale de la provincia de destino (mapa de la tarifa) resolviendo la ciudad. "
                  "En huecos de tramo se aplica el inferior. Palets/paquetería (kg × zona) y "
                  "espejos (internacional) PENDIENTES de estructurar.",
        "tipo_tarifa": "dhl_bultos_zona (mamparas)",
        "compara_contra": "Portes",
        "tarifa_auto": "Mamparas: sí (al subir el Excel se extraen tramos + mapa de zonas).",
    },
    "DHL Freight": {
        "estado": "desarrollo",
        "keywords": ["DHL Freight", "DHL FREIGHT", "dhl freight"],
        "formatos": ["PDF"],
        "extraccion": "Texto del PDF; las expediciones se localizan por referencias 'FRT'.",
        "columnas": ["Expedición (FRT)", "Destino", "Kg", "Portes", "Total"],
        "reglas_especiales": [],
        "tarifa": "Pendiente de definir estructura de reglas.",
        "tipo_tarifa": None,
        "compara_contra": "Total",
        "tarifa_auto": "No.",
    },
    "CEVA": {
        "estado": "desarrollo",
        "keywords": ["CEVA", "ceva logistics"],
        "formatos": ["Excel", "CSV", "PDF"],
        "extraccion": "Lectura por columnas de Excel/CSV; PDF por texto.",
        "columnas": ["Expedición", "Destino", "Bultos", "Kg", "Portes", "Total"],
        "reglas_especiales": [],
        "tarifa": "Pendiente de definir estructura de reglas.",
        "tipo_tarifa": None,
        "compara_contra": "Total",
        "tarifa_auto": "No.",
    },
    "TDN": {
        "estado": "validado",
        "keywords": ["TDN", "Transcomensal", "TRANSCOMENSAL"],
        "formatos": ["Excel"],
        "extraccion": "Factura en Excel (extensión .xls engañosa, es xlsx). Trae CP de "
                      "destino y PESO REAL → auditoría objetiva, sin estimaciones.",
        "columnas": ["Factura", "Expedición", "S/REF (→albarán)", "CP destino",
                     "Población", "Bultos", "Kg (real)", "Portes", "Reexped.", "Seguro", "Otros", "Total"],
        "reglas_especiales": [
            "Peso REAL en la factura (no estimado).",
            "'S/REF' = referencia Doccia → albarán Doccia.",
            "Portugal (CP de 7 dígitos) se factura aparte, no en la tarifa nacional.",
        ],
        "tarifa": "Peso (tramo 'hasta kg') × BAREMO (B1–B7). El baremo sale del CP de "
                  "destino. ~91% de cobertura en líneas de España; se afina con más facturas.",
        "tipo_tarifa": "tdn_peso_baremo",
        "compara_contra": "Portes",
        "tarifa_auto": "Sí — al subir el PDF de tarifa se extrae la tabla peso×baremo.",
    },
    "DSV": {
        "estado": "desarrollo",
        "keywords": ["DSV", "dsv road"],
        "formatos": ["Excel", "CSV", "PDF"],
        "extraccion": "Lectura por columnas de Excel/CSV; PDF por texto. "
                      "Referencias 'SIN REF' se marcan sin referencia.",
        "columnas": ["Expedición", "Destino", "Bultos", "Kg", "Portes", "Total"],
        "reglas_especiales": [],
        "tarifa": "Pendiente de definir estructura de reglas.",
        "tipo_tarifa": None,
        "compara_contra": "Total",
        "tarifa_auto": "No.",
    },
}

# Palabras clave de detección derivadas del registro (single source of truth)
KEYWORDS: dict[str, list[str]] = {a: m["keywords"] for a, m in AGENCY_META.items()}

ESTADO_BADGE = {
    "validado":   ("✅", "Validado", "#16a34a", "#f0fdf4", "#86efac"),
    "desarrollo": ("🚧", "En desarrollo", "#c2410c", "#fff7ed", "#fdba74"),
    "pendiente":  ("⏳", "Pendiente", "#854d0e", "#fef9c3", "#fde047"),
}
