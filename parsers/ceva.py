import re
from pathlib import Path
from parsers.base_parser import BaseParser
from normalizer import normalize_albaran, normalize_float, normalize_int


class CEVAParser(BaseParser):
    agency_name = "CEVA"

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
            num_albaran = self._col(r, ["Nº Albarán", "Num Albaran", "Albaran", "Albaran Nº"])
            s_ref = self._col(r, ["S/Ref", "Su Referencia", "Ref. Cliente"])
            destino = self._col(r, ["Destino", "Destination"])
            destinatario = self._col(r, ["Destinatario", "Receiver"])
            fecha = self._col(r, ["Fecha", "Date", "Fecha Envío"])
            bultos = normalize_int(self._col(r, ["Bultos", "Piezas", "Pieces"]))
            kilos = normalize_float(self._col(r, ["Kilos", "Kg", "Peso"]))
            total = normalize_float(self._col(r, ["Total", "Importe"]))

            albaran_doccia, estado = normalize_albaran(s_ref, self.agency_name)
            row = self.empty_row()
            row.update({
                "factura": factura,
                "expedicion_agencia": num_albaran,
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
        # S/Ref pattern: extract reference lines
        for line in full_text.split("\n"):
            ref_m = re.search(r'S/Ref[:\s]+(\S+)', line, re.I)
            if ref_m:
                s_ref = ref_m.group(1).strip()
                albaran_doccia, estado = normalize_albaran(s_ref, self.agency_name)
                row = self.empty_row()
                row.update({
                    "factura": factura,
                    "albaran_doccia": albaran_doccia,
                    "estado_cruce": estado,
                })
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
