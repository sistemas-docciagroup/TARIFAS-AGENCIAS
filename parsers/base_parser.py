from abc import ABC, abstractmethod
from normalizer import normalize_date, normalize_float, normalize_int


class BaseParser(ABC):
    agency_name: str = ""

    @abstractmethod
    def parse(self, source) -> list[dict]:
        """Parse a PDF path or Excel path and return list of row dicts."""

    def empty_row(self) -> dict:
        return {
            "agencia": self.agency_name,
            "factura": None,
            "fecha_envio": None,
            "expedicion_agencia": None,
            "albaran_doccia": None,
            "pedido_doccia": None,
            "destino": None,
            "destinatario": None,
            "bultos": None,
            "kilos": None,
            "peso_facturable": None,
            "portes": None,
            "combustible": None,
            "seguro": None,
            "reexpedicion": None,
            "otros": None,
            "total_facturado": None,
            "estado_cruce": None,
            "observaciones": None,
        }

    def safe_float(self, v) -> float | None:
        return normalize_float(v)

    def safe_int(self, v) -> int | None:
        return normalize_int(v)

    def safe_date(self, v) -> str | None:
        return normalize_date(v)
