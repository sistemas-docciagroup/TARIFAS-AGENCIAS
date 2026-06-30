import json
from typing import Any
from sqlalchemy.orm import Session
from database.models import Tarifa, EstadoTarifa


def find_tariff(
    db: Session,
    agencia: str,
    tipologia: str | None,
    fecha_envio: str | None,
) -> Tarifa | None:
    q = db.query(Tarifa).filter(
        Tarifa.agencia == agencia,
        Tarifa.estado == EstadoTarifa.ACTIVA,
    )
    if tipologia:
        q = q.filter(Tarifa.tipologia == tipologia)
    if fecha_envio:
        q = q.filter(Tarifa.fecha_inicio <= fecha_envio).filter(
            (Tarifa.fecha_fin == None) | (Tarifa.fecha_fin >= fecha_envio)
        )
    return q.order_by(Tarifa.version.desc()).first()


def calculate_expected_amount(tarifa: Tarifa, line_data: dict[str, Any]) -> dict[str, Any]:
    if not tarifa or not tarifa.reglas_json:
        return {"importe_calculado": None, "estado": "SIN_TARIFA"}
    try:
        reglas = json.loads(tarifa.reglas_json)
    except (json.JSONDecodeError, TypeError):
        return {"importe_calculado": None, "estado": "TARIFA_DUDOSA"}

    # ── Tarifa de escalados de Molartrans (material + kg + provincia) ─────────
    if reglas.get("tipo_tarifa") in ("molartrans_escalados", "molartrans_nacional"):
        if line_data.get("albaran") and line_data.get("peso_sap") is None:
            from services.sap_client import get_peso
            sap_peso = get_peso(line_data.get("albaran"), "Molartrans")
            if sap_peso:
                line_data = {**line_data, "peso_sap": sap_peso,
                             "tramo_kg": line_data.get("tramo_kg") or sap_peso}

    if reglas.get("tipo_tarifa") == "molartrans_escalados":
        return _molartrans_escalado(reglas, line_data)

    # ── Tarifa DHL Parcel: precio por nº de bultos × zona (provincia) ─────────
    if reglas.get("tipo_tarifa") == "dhl_bultos_zona":
        return _dhl_bultos_zona(reglas, line_data)

    # ── Tarifa Molartrans NACIONAL: zona-destino (provincia) × tramo kg ───────
    if reglas.get("tipo_tarifa") == "molartrans_nacional":
        return _molartrans_nacional(reglas, line_data)

    # ── Tarifa TDN: peso (tramo kg) × baremo (B1–B7) según CP destino ─────────
    if reglas.get("tipo_tarifa") == "tdn_peso_baremo":
        return _tdn_peso_baremo(reglas, line_data)

    peso = float(line_data.get("peso_facturable") or line_data.get("kilos") or 0)
    zona = str(line_data.get("zona") or "")
    cp_destino = str(line_data.get("cp_destino") or "")

    importe = _apply_weight_zone_rules(reglas, peso, zona, cp_destino)
    if importe is None:
        return {"importe_calculado": None, "estado": "REGLA_NO_ENCONTRADA"}

    combustible_pct = float(reglas.get("combustible_pct") or 0)
    combustible = round(importe * combustible_pct / 100, 4)
    tasa_pct = float(reglas.get("tasa_energetica_pct") or 0)
    tasa = round(importe * tasa_pct / 100, 4)
    total = round(importe + combustible + tasa, 4)

    return {
        "importe_calculado": total,
        "portes_calculado": importe,
        "combustible_calculado": combustible,
        "tasa_energetica_calculada": tasa,
        "estado": "TARIFA_OK",
    }


def _molartrans_escalado(reglas: dict, line_data: dict[str, Any]) -> dict[str, Any]:
    """
    Calcula el porte esperado de Molartrans a partir de:
      · material  (MAMPARA / PALETS / BULTO / PAQUETE)
      · tramo_kg  (hasta N kg)
      · CP destino → escalado (1/2/3) según provincia
    Devuelve importe = portes esperado (sin seguro ni comisión de reembolso).
    """
    material = str(line_data.get("material") or "").upper()
    tramo_kg = line_data.get("tramo_kg")
    bultos   = line_data.get("bultos")
    cp       = str(line_data.get("cp_destino") or "")
    estimado_por_bultos = False

    # Provincia destino → escalado
    cp_esc = reglas.get("cp_escalado") or {}
    escalado = cp_esc.get(cp[:2]) if len(cp) >= 2 else None
    if not escalado:
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": "Destino fuera de la tarifa Andalucía"}

    # Bultos / paquetes sueltos → se tarifan como MAMPARA
    if material in ("BULTO", "PAQUETE", ""):
        fb = reglas.get("bulto_paquete_como") or {}
        material = fb.get("material", "MAMPARA")

    # Regla Molartrans: si no conocemos el peso/tramo, lo estimamos por bultos.
    # 1 bulto = 30 kg, 2 bultos = 60 kg, … (kg_por_bulto configurable, def. 30).
    if not tramo_kg and bultos:
        kg_por_bulto = float(reglas.get("kg_por_bulto") or 30)
        tramo_kg = int(bultos) * kg_por_bulto
        estimado_por_bultos = True
    if not tramo_kg:
        fb = reglas.get("bulto_paquete_como") or {}
        tramo_kg = fb.get("hasta", 30)

    tramos = (reglas.get("tramos") or {}).get(material)
    if not tramos:
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": f"Sin tramos para material {material}"}

    # Elegir el tramo: por el "hasta N" declarado, o por el peso si no hay tramo
    objetivo = float(tramo_kg) if tramo_kg else 0.0
    tramo = None
    for t in sorted(tramos, key=lambda x: x["hasta"]):
        if objetivo <= t["hasta"]:
            tramo = t
            break
    if tramo is None and tramos:
        tramo = max(tramos, key=lambda x: x["hasta"])   # supera el máximo → último tramo

    if not tramo:
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": "No se encontró tramo de peso"}

    precio = tramo["precios"].get(str(escalado))
    if precio is None:
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": f"Sin precio para escalado {escalado}"}

    # El peso de la factura Molartrans NO es real (lo dará SAP). Mientras tanto, si
    # el tramo elegido no cuadra, buscamos en el MISMO escalado el tramo que cuadre
    # con el importe (provisional). El escalado lo fija la provincia, así que esto
    # no enmascara cambios de zona, solo ajusta el tramo de peso desconocido.
    tramo_por_importe = False
    importe_real = line_data.get("importe_real")
    sin_peso_real = line_data.get("peso_sap") is None   # SAP aún no da el peso
    if (sin_peso_real and importe_real is not None
            and abs(float(precio) - float(importe_real)) > 0.05):
        for t in sorted(tramos, key=lambda x: x["hasta"]):
            p = t["precios"].get(str(escalado))
            if p is not None and abs(float(p) - float(importe_real)) <= 0.05:
                tramo, precio, tramo_por_importe = t, p, True
                break

    return {
        "importe_calculado":   round(float(precio), 2),
        "portes_calculado":    round(float(precio), 2),
        "escalado":            escalado,
        "material":            material,
        "tramo_hasta":         tramo["hasta"],
        "estimado_por_bultos": estimado_por_bultos,
        "tramo_por_importe":   tramo_por_importe,
        "estado":              "TARIFA_OK",
    }


def _tdn_peso_baremo(reglas: dict, line_data: dict[str, Any]) -> dict[str, Any]:
    """
    Precio esperado de TDN = tabla peso (tramo 'hasta kg') × baremo (B1–B7).
    El baremo sale del CP de destino; el peso es el REAL de la factura → auditoría
    objetiva (sin estimaciones).
    """
    cp = str(line_data.get("cp_destino") or "")
    if len(cp) == 7:   # CP portugués → TDN lo factura aparte (no en la tarifa nacional)
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": "Portugal (necesita tarifa TDN aparte)"}
    exc = reglas.get("cp_baremo_exc") or {}
    prov = reglas.get("cp_baremo") or {}
    baremo = exc.get(cp) or (prov.get(cp[:2]) if len(cp) >= 2 else None)
    if not baremo:
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": f"CP {cp[:2] or '?'} sin baremo en la tarifa TDN"}

    kg = line_data.get("kilos") or line_data.get("peso_facturable") or line_data.get("tramo_kg")
    if not kg:
        return {"importe_calculado": None, "estado": "SIN_TARIFA", "motivo": "Sin peso"}

    pesos = reglas.get("pesos") or []
    precios = reglas.get("precios") or []
    if not pesos or not precios:
        return {"importe_calculado": None, "estado": "SIN_TARIFA", "motivo": "Tarifa sin tabla"}

    fila = precios[-1]
    for i, pmax in enumerate(pesos):
        if float(kg) <= pmax:
            fila = precios[i]
            break
    idx = int(baremo) - 1
    if idx < 0 or idx >= len(fila):
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": f"Baremo {baremo} fuera de rango"}

    precio = fila[idx]
    return {
        "importe_calculado": round(float(precio), 2),
        "portes_calculado":  round(float(precio), 2),
        "baremo":            f"B{baremo}",
        "estado":            "TARIFA_OK",
    }


def _molartrans_nacional(reglas: dict, line_data: dict[str, Any]) -> dict[str, Any]:
    """
    Tarifa nacional de Molartrans (resto de España): precio por provincia de
    destino × tramo de kg (30/60/90/120). Las provincias con zona propia
    (Madrid, Valencia, Alicante, Murcia, Toledo, Guadalajara) tienen su precio;
    el resto peninsular usa la fila 'default'.
    """
    from services.geo_es import CP2_PROVINCIA

    cp = str(line_data.get("cp_destino") or "")
    prov = CP2_PROVINCIA.get(cp[:2]) if len(cp) >= 2 else None

    zonas = reglas.get("zonas") or {}
    fila = zonas.get(prov) if prov else None
    usado = prov
    if fila is None:
        fila = zonas.get("default")
        usado = "resto peninsular"
    if not fila:
        return {"importe_calculado": None, "estado": "SIN_TARIFA",
                "motivo": "Sin tarifa nacional para el destino"}

    # kg: el tramo declarado o, si no, estimado por bultos (30 kg/bulto)
    kg = line_data.get("tramo_kg")
    if not kg and line_data.get("bultos"):
        kg = int(line_data["bultos"]) * float(reglas.get("kg_por_bulto") or 30)
    if not kg:
        kg = line_data.get("kilos") or 30

    tramos_kg = reglas.get("tramos_kg") or [30, 60, 90, 120]
    col = len(tramos_kg) - 1
    for i, lim in enumerate(tramos_kg):
        if float(kg) <= lim:
            col = i
            break
    if col >= len(fila):
        col = len(fila) - 1

    precio = fila[col]
    estimado = False
    # El peso declarado es poco fiable (Molartrans retarifica). Mientras SAP no dé
    # el peso real, si no cuadra con el tramo elegido buscamos el tramo de la misma
    # zona que cuadre con el importe (provisional). Con peso de SAP esto se desactiva.
    importe_real = line_data.get("importe_real")
    sin_peso_real = line_data.get("peso_sap") is None
    if (sin_peso_real and importe_real is not None
            and abs(float(precio) - float(importe_real)) > 0.05):
        for j, p in enumerate(fila):
            if abs(float(p) - float(importe_real)) <= 0.05:
                col, precio, estimado = j, p, True
                break

    return {
        "importe_calculado":   round(float(precio), 2),
        "portes_calculado":    round(float(precio), 2),
        "zona":                usado,
        "tramo_kg":            tramos_kg[col] if col < len(tramos_kg) else tramos_kg[-1],
        "tramo_por_importe":   estimado,
        "estado":              "TARIFA_OK",
    }


def _dhl_bultos_zona(reglas: dict, line_data: dict[str, Any]) -> dict[str, Any]:
    """
    Precio esperado de DHL Parcel = tabla nº bultos × zona.

    Resolución de la zona, por orden de fiabilidad:
      1. CP de SAP (cuando esté conectado) → provincia → zona (exacto).
      2. Ciudad mapeada sin ambigüedad → zona.
      3. Ciudad ambigua (varias provincias posibles) → se elige POR DESCARTE la
         opción cuyo precio cuadra con el importe facturado; si ninguna cuadra,
         se marca diferencia (revisar / pendiente de SAP).
    En los huecos de tramo (8 ó 10 bultos) se aplica el tramo inferior.
    """
    from services.geo_es import zonas_candidatas
    from services.sap_client import get_cp

    bultos = line_data.get("bultos")
    destino = line_data.get("destino") or line_data.get("cp_destino") or ""
    if not bultos:
        return {"importe_calculado": None, "estado": "SIN_TARIFA", "motivo": "Sin bultos"}

    # CP: el que venga en la línea o, si no, el que dé SAP por el albarán
    cp = line_data.get("cp") or get_cp(line_data.get("albaran"), line_data.get("agencia") or "DHL Parcel")

    candidatas, motivo = zonas_candidatas(destino, reglas.get("provincia_zona") or {}, cp)
    if not candidatas:
        return {"importe_calculado": None, "estado": "SIN_TARIFA", "motivo": motivo}

    tramos = sorted(reglas.get("tramos_bultos") or [], key=lambda t: t["desde"])
    tramo = None
    for t in tramos:
        if t["desde"] <= bultos:
            tramo = t
        else:
            break
    if tramo is None:
        tramo = tramos[0] if tramos else None
    if tramo is None:
        return {"importe_calculado": None, "estado": "SIN_TARIFA", "motivo": "Tarifa sin tramos"}

    precios_por_zona = tramo.get("precios") or {}

    def _p(z):
        return precios_por_zona.get(str(z))

    importe_real = line_data.get("importe_real")

    # ── Caso 1: zona única ───────────────────────────────────────────────────
    if len(candidatas) == 1:
        z = candidatas[0]
        precio = _p(z)
        if precio is None:
            return {"importe_calculado": None, "estado": "SIN_TARIFA",
                    "motivo": f"Sin precio para zona {z} / {bultos} bultos"}
        return {"importe_calculado": round(float(precio), 2),
                "portes_calculado": round(float(precio), 2),
                "zona": z, "tramo_bultos": f"{tramo['desde']}-{tramo['hasta']}",
                "motivo_zona": motivo, "estado": "TARIFA_OK"}

    # ── Caso 2: ciudad ambigua → elegir por descarte (importe) ───────────────
    opciones = [(z, _p(z)) for z in candidatas if _p(z) is not None]
    if importe_real is not None:
        for z, precio in opciones:
            if abs(float(precio) - float(importe_real)) <= 0.02:
                return {"importe_calculado": round(float(precio), 2),
                        "portes_calculado": round(float(precio), 2),
                        "zona": z, "tramo_bultos": f"{tramo['desde']}-{tramo['hasta']}",
                        "motivo_zona": f"{motivo}; cuadra con Z{z} (provisional, pdte. SAP)",
                        "ambigua_resuelta": True, "estado": "TARIFA_OK"}
    # Ninguna opción cuadra → diferencia (devolvemos la primera para comparar)
    if opciones:
        z, precio = opciones[0]
        return {"importe_calculado": round(float(precio), 2),
                "portes_calculado": round(float(precio), 2),
                "zona": z, "tramo_bultos": f"{tramo['desde']}-{tramo['hasta']}",
                "motivo_zona": f"{motivo}; ninguna opción cuadra con el importe → revisar/SAP",
                "ambigua_sin_cuadrar": True, "estado": "TARIFA_OK"}
    return {"importe_calculado": None, "estado": "SIN_TARIFA",
            "motivo": f"{motivo}; sin precio en ninguna opción"}


def _apply_weight_zone_rules(reglas: dict, peso: float, zona: str, cp_destino: str) -> float | None:
    tramos = reglas.get("tramos")
    if not tramos:
        return None

    if zona and zona in tramos:
        zona_tramos = tramos[zona]
    elif "default" in tramos:
        zona_tramos = tramos["default"]
    elif isinstance(tramos, list):
        zona_tramos = tramos
    else:
        return None

    for tramo in sorted(zona_tramos, key=lambda t: float(t.get("hasta") or 9999999)):
        desde = float(tramo.get("desde") or 0)
        hasta = float(tramo.get("hasta") or 9999999)
        if desde <= peso <= hasta:
            if "precio" in tramo:
                return float(tramo["precio"])
            elif "precio_kg" in tramo:
                minimo = float(tramo.get("minimo") or 0)
                return max(round(float(tramo["precio_kg"]) * peso, 4), minimo)
    return None


def compare_amounts(importe_facturado: float, importe_calculado: float | None, tolerancia_pct: float = 2.0) -> dict:
    if importe_calculado is None:
        return {"diferencia": None, "porcentaje": None, "estado": "SIN_TARIFA"}
    diferencia = round(importe_facturado - importe_calculado, 4)
    porcentaje = round(diferencia / importe_calculado * 100, 2) if importe_calculado else 0
    estado = "TARIFA_OK" if abs(porcentaje) <= tolerancia_pct else "DIFERENCIA_TARIFA"
    return {"diferencia": diferencia, "porcentaje": porcentaje, "estado": estado}
