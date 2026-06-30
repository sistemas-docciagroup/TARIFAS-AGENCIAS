from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "transportes.db"
_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{_DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def init_db():
    from database.models import Albaran, Tarifa  # noqa: F401
    Base.metadata.create_all(engine)
    _migrate(engine)


def _migrate(eng):
    """Add columns that may be missing from older DB versions."""
    new_cols = {
        "albaranes": [
            ("tarifa_id", "INTEGER"),
            ("importe_tarifa", "REAL"),
            ("diferencia_importe", "REAL"),
            ("porcentaje_diferencia", "REAL"),
            ("estado_tarifa", "VARCHAR(50)"),
        ],
        "tarifas": [
            ("tipologia", "VARCHAR(200)"),
        ],
    }
    with eng.connect() as conn:
        for table, cols in new_cols.items():
            existing = {row[1] for row in conn.execute(
                text(f"PRAGMA table_info({table})")
            )}
            for col_name, col_type in cols:
                if col_name not in existing:
                    conn.execute(text(
                        f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    ))
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
