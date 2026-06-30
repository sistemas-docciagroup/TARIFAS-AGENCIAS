import enum
from datetime import datetime
from sqlalchemy import String, Float, Integer, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database.db import Base


class Albaran(Base):
    __tablename__ = "albaranes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fecha_carga: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    archivo_origen: Mapped[str | None] = mapped_column(String(255))
    agencia_detectada: Mapped[str | None] = mapped_column(String(100))

    agencia: Mapped[str | None] = mapped_column(String(100))
    factura: Mapped[str | None] = mapped_column(String(100))
    fecha_envio: Mapped[str | None] = mapped_column(String(20))
    expedicion_agencia: Mapped[str | None] = mapped_column(String(100))
    albaran_doccia: Mapped[str | None] = mapped_column(String(100))
    pedido_doccia: Mapped[str | None] = mapped_column(String(100))
    destino: Mapped[str | None] = mapped_column(String(200))
    destinatario: Mapped[str | None] = mapped_column(String(200))
    bultos: Mapped[int | None] = mapped_column(Integer)
    kilos: Mapped[float | None] = mapped_column(Float)
    peso_facturable: Mapped[float | None] = mapped_column(Float)
    portes: Mapped[float | None] = mapped_column(Float)
    combustible: Mapped[float | None] = mapped_column(Float)
    seguro: Mapped[float | None] = mapped_column(Float)
    reexpedicion: Mapped[float | None] = mapped_column(Float)
    otros: Mapped[float | None] = mapped_column(Float)
    total_facturado: Mapped[float | None] = mapped_column(Float)
    estado_cruce: Mapped[str | None] = mapped_column(String(50))
    observaciones: Mapped[str | None] = mapped_column(Text)

    # Campos de auditoría (se rellenan al cruzar con tarifa)
    tarifa_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("tarifas.tarifa_id"), nullable=True)
    importe_tarifa: Mapped[float | None] = mapped_column(Float)
    diferencia_importe: Mapped[float | None] = mapped_column(Float)
    porcentaje_diferencia: Mapped[float | None] = mapped_column(Float)
    estado_tarifa: Mapped[str | None] = mapped_column(String(50))


class EstadoTarifa(str, enum.Enum):
    ACTIVA = "activa"
    SUSTITUIDA = "sustituida"
    HISTORICA = "historica"
    PENDIENTE_REVISION = "pendiente_revision"


class Tarifa(Base):
    __tablename__ = "tarifas"

    tarifa_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agencia: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Cabecera de texto que identifica la tarifa (tipología de producto),
    # p. ej. "Tarifa DHL mamparas". Es la llave para asociarla a cada albarán.
    tipologia: Mapped[str | None] = mapped_column(String(200), index=True)
    cuenta_agencia: Mapped[str | None] = mapped_column(String(200), index=True)
    servicio_agencia: Mapped[str | None] = mapped_column(String(100))
    fecha_inicio: Mapped[str] = mapped_column(String(20), nullable=False)
    fecha_fin: Mapped[str | None] = mapped_column(String(20))
    version: Mapped[int] = mapped_column(Integer, default=1)
    archivo_nombre: Mapped[str | None] = mapped_column(String(500))
    ruta_archivo: Mapped[str | None] = mapped_column(String(500))
    reglas_json: Mapped[str | None] = mapped_column(Text)
    estado: Mapped[EstadoTarifa] = mapped_column(SAEnum(EstadoTarifa), default=EstadoTarifa.ACTIVA, index=True)
    notas: Mapped[str | None] = mapped_column(Text)
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
