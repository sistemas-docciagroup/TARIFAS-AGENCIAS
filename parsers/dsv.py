import re
from pathlib import Path
from parsers.base_parser import BaseParser
from normalizer import normalize_albaran, normalize_float, normalize_int

_SIN_REF = {"SIN REF", "SIN_REF", "SINREF", "S/REF", ""}


class DSVParser(BaseParser):
    agency_name = "DSV"

    def parse(self, source) -> list[dict]:
        path = Path(source)
        try:
            if path.suffix.lower() in {".xlsx", ".xls", ".csv"}:
                return self._parse_excel(path)
            return self._parse_pdf(path)
        except Exception as e:
            row = self.empty_row()
            row["estado_cruce"] = "ERROR_LECTURA"
            row["observaciones"] = str(e)
            return [row]

    def _parse_excel(self, path: Path) -> list[dict]:
        import pandas as pd
        df = pd.read_excel(path, dtype=str) if path.suffix.lower() != ".csv" else \
             pd.read_csv(path, dtype=str, sep=None, engine="python")
        df = df.fillna("")
        rows = []
        factura = path.stem
        for _, r in df.iterrows():
            s_ref = self._col(r, ["S/Ref", "Su Referencia", "Ref. Cliente", "Reference"])
            expedicion = self._col(r, ["Expedicion", "Nº Expedición", "Shipment"])
            destino = self._col(r, ["Destino", "Destination"])
            destinatario = self._col(r, ["Destinatario", "Receiver"])
            fecha = self._col(r, ["Fecha", "Date"])
            bultos = normalize_int(self._col(r, ["Bultos", "Piezas"]))
            kilos = normalize_float(self._col(r, ["Kilos", "Kg", "Peso"]))
            total = normalize_float(self._col(r, ["Total", "Importe"]))

            if s_ref.upper() in _SIN_REF:
                albaran_doccia = None
                estado = "SIN_REFERENCIA"
            else:
                albaran_doccia = s_ref  # DSV: mantener tal cual
                estado = "ALBARAN_OK"

            row = self.empty_row()
            row.update({
                "factura": factura,
                "expedicion_agencia": expedicion,
                "albaran_doccia": albaran_doccia,
                "destino": destino,
                "destinatario": destinatario,
                "fecha_envio": fecha,
                "bultos": bultos,
                "kilos": kilos,
                "total_facturado": total,
                "estado_cruce": estado,
            })
            rows.append(row)
        return rows

    def _parse_pdf(self, path: Path) -> list[dict]:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            full_text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        factura_m = re.search(r'Factura[^\d]*(\d[\d/\-]+)', full_text, re.I)
        factura = factura_m.group(1).strip() if factura_m else path.stem
        rows = []
        for line in full_text.split("\n"):
            ref_m = re.search(r'S/Ref[:\s]+(\S+)', line, re.I)
            if ref_m:
                s_ref = ref_m.group(1).strip()
                if s_ref.upper() in _SIN_REF:
                    albaran_doccia, estado = None, "SIN_REFERENCIA"
                else:
                    albaran_doccia, estado = s_ref, "ALBARAN_OK"
                row = self.empty_row()
                row.update({"factura": factura, "albaran_doccia": albaran_doccia, "estado_cruce": estado})
                rows.append(row)
        if not rows:
            row = self.empty_row()
            row["factura"] = factura
            row["estado_cruce"] = "DUDOSO"
            rows.append(row)
        return rows

    def _col(self, row, candidates: list[str]) -> str:
        for c in candidates:
            if c in row.index and str(row[c]).strip():
                return str(row[c]).strip()
        return ""
