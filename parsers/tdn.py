import re
from pathlib import Path
from parsers.base_parser import BaseParser
from normalizer import normalize_albaran

# Las facturas de TDN son Excel (a veces con extensión .xls engañosa pero xlsx).
# Cabecera: FACTURA | FECHA | EXP. | S/REF. | CPOSTAL ORIG | POBLACIÓN ORIG |
#   CPOSTAL DEST | POBLACIÓN DEST | REMITENTE | DESTINATARIO | TIPO PORTES |
#   TIPO SERVICIO | NBULTOS | KGS | VOLUMEN | PORT | REEX | DESE | SEGU | ... | TOTAL | % IVA

_HDR = {
    "factura": ["FACTURA"], "fecha": ["FECHA"], "exp": ["EXP"],
    "sref": ["S/REF", "SREF"], "cp_dest": ["CPOSTAL DEST", "CP DEST"],
    "pob_dest": ["POBLACION DEST", "POBLACIÓN DEST"], "dest": ["DESTINATARIO"],
    "bultos": ["NBULTOS"], "kgs": ["KGS", "KG"], "port": ["PORT"],
    "reex": ["REEX"], "segu": ["SEGU"], "total": ["TOTAL"],
}
# Conceptos que se agrupan en "otros" (todo lo facturado que no es porte/seguro/reexp)
_OTROS_COLS = ["DESE", "VACO", "CONE", "COMI", "DUOR", "IECO", "MERC", "OTROS",
               "EDOM", "EPIE", "SAD1", "SREP"]


def _f(v):
    try:
        return float(str(v).strip().replace(',', '.'))
    except (TypeError, ValueError):
        return 0.0


def _iso(fecha):
    s = str(fecha).strip()
    m = re.match(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', s)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    return s[:10]


class TDNParser(BaseParser):
    agency_name = "TDN"

    def parse(self, source) -> list[dict]:
        path = Path(source)
        try:
            if path.suffix.lower() in {".xlsx", ".xlsm", ".xls", ".csv"}:
                return self._parse_excel(path)
            return self._parse_pdf(path)
        except Exception as e:
            row = self.empty_row()
            row["estado_cruce"] = "ERROR_LECTURA"
            row["observaciones"] = str(e)
            return [row]

    def _parse_excel(self, path: Path) -> list[dict]:
        import pandas as pd
        if path.suffix.lower() == ".csv":
            df = pd.read_csv(path, dtype=str, header=0)
        else:
            # Los .xls de TDN son realmente xlsx → openpyxl
            df = pd.read_excel(path, dtype=str, header=0, engine="openpyxl")
        df = df.fillna("")

        cols = {c: str(c).strip().upper() for c in df.columns}
        def find(keys):
            for c, up in cols.items():
                if any(up == k or up.startswith(k) for k in keys):
                    return c
            return None
        cmap = {k: find([x.upper() for x in v]) for k, v in _HDR.items()}
        otros_cols = [c for c, up in cols.items() if up in _OTROS_COLS]

        rows = []
        for _, r in df.iterrows():
            fac = str(r.get(cmap["factura"], "")).strip() if cmap["factura"] else ""
            if not fac or fac.upper() == "FACTURA":
                continue
            sref = str(r.get(cmap["sref"], "")).strip() if cmap["sref"] else ""
            albaran_doccia, estado = normalize_albaran(sref, self.agency_name)
            cp = str(r.get(cmap["cp_dest"], "")).strip() if cmap["cp_dest"] else ""
            pob = str(r.get(cmap["pob_dest"], "")).strip() if cmap["pob_dest"] else ""
            otros = sum(_f(r.get(c)) for c in otros_cols)

            row = self.empty_row()
            row.update({
                "factura":            fac,
                "fecha_envio":        _iso(r.get(cmap["fecha"], "")) if cmap["fecha"] else "",
                "expedicion_agencia": str(r.get(cmap["exp"], "")).strip() if cmap["exp"] else "",
                "albaran_doccia":     albaran_doccia,
                "destinatario":       str(r.get(cmap["dest"], "")).strip() if cmap["dest"] else "",
                "destino":            f"{pob} ({cp})" if cp else pob,
                "bultos":             int(_f(r.get(cmap["bultos"]))) if cmap["bultos"] else None,
                "kilos":              _f(r.get(cmap["kgs"])) if cmap["kgs"] else None,
                "peso_facturable":    _f(r.get(cmap["kgs"])) if cmap["kgs"] else None,
                "portes":             _f(r.get(cmap["port"])) if cmap["port"] else None,
                "seguro":             _f(r.get(cmap["segu"])) if cmap["segu"] else None,
                "reexpedicion":       _f(r.get(cmap["reex"])) if cmap["reex"] else None,
                "otros":              otros or None,
                "total_facturado":    _f(r.get(cmap["total"])) if cmap["total"] else None,
                "estado_cruce":       estado,
                "observaciones":      f"CP dest: {cp}",
            })
            rows.append(row)

        if not rows:
            row = self.empty_row()
            row["estado_cruce"] = "DUDOSO"
            row["observaciones"] = "No se reconocieron líneas en el Excel de TDN."
            return [row]
        return rows

    def _parse_pdf(self, path: Path) -> list[dict]:
        row = self.empty_row()
        row["estado_cruce"] = "ERROR_LECTURA"
        row["observaciones"] = "Las facturas de TDN deben subirse en Excel."
        return [row]
