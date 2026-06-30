from pathlib import Path
from datetime import datetime

_TARIFAS_DIR = Path(__file__).resolve().parent.parent / "data" / "tarifas"
_TARIFAS_DIR.mkdir(parents=True, exist_ok=True)


def save_tariff_file(filename: str, content: bytes) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = _TARIFAS_DIR / f"{ts}_{filename}"
    dest.write_bytes(content)
    return dest
