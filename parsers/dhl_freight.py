import re
from pathlib import Path
from parsers.base_parser import BaseParser
from normalizer import normalize_date, normalize_float


class DHLFreightParser(BaseParser):
    agency_name = "DHL Freight"

    def parse(self, source) -> list[dict]:
        path = Path(source)
        try:
            import pdfplumber
            with pdfplumber.open(path) as pdf:
                full_text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception as e:
            row = self.empty_row()
            row["estado_cruce"] = "ERROR_LECTURA"
            row["observaciones"] = str(e)
            return [row]

        factura_m = re.search(r'Factura[^\d]*(\d[\d\-/]+)', full_text, re.I)
        factura = factura_m.group(1).strip() if factura_m else path.stem

        # Buscar referencias FRT — son la expedición de DHL Freight
        frt_re = re.compile(r'\b(FRT\d+|\d{9,12})\b', re.I)
        fecha_re = re.compile(r'\b(\d{2}[/-]\d{2}[/-]\d{4})\b')
        dest_re = re.compile(r'Destino[:\s]+(.+)', re.I)

        rows = []
        for m in frt_re.finditer(full_text):
            frt_ref = m.group(1)
            row = self.empty_row()
            row.update({
                "factura": factura,
                "expedicion_agencia": frt_ref,
                "albaran_doccia": None,
                "pedido_doccia": None,
                "estado_cruce": "EXPEDICION_AGENCIA",
                "observaciones": "Albarán y pedido se obtienen desde SAP por referencia FRT",
            })
            rows.append(row)

        if not rows:
            row = self.empty_row()
            row["factura"] = factura
            row["estado_cruce"] = "DUDOSO"
            row["observaciones"] = "No se encontraron referencias FRT en el PDF"
            rows.append(row)
        return rows
