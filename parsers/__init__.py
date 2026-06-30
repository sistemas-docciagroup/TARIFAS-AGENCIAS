from parsers.molartrans import MolartransParser
from parsers.dhl_parcel import DHLParcelParser
from parsers.dhl_freight import DHLFreightParser
from parsers.ceva import CEVAParser
from parsers.tdn import TDNParser
from parsers.dsv import DSVParser

PARSERS: dict[str, type] = {
    "Molartrans": MolartransParser,
    "DHL Parcel": DHLParcelParser,
    "DHL Freight": DHLFreightParser,
    "CEVA": CEVAParser,
    "TDN": TDNParser,
    "DSV": DSVParser,
}
