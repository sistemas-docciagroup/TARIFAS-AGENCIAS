import json
import streamlit as st
from database.db import SessionLocal
from database.models import Tarifa
from services.tariff_engine import find_tariff, calculate_expected_amount

AGENCIAS = ["DHL Parcel", "DHL Freight", "Molartrans", "DSV", "CEVA", "TDN", "FF Vale"]


def render():
    st.title("🧮 Simulador de tarifas")
    st.markdown("Calcula el coste esperado de un envío según la tarifa activa.")

    db0 = SessionLocal()
    try:
        ag = st.selectbox("Agencia *", AGENCIAS)
        tipologias = [t[0] for t in db0.query(Tarifa.tipologia)
                      .filter(Tarifa.agencia == ag).distinct().all() if t[0]]
    finally:
        db0.close()

    col1, col2 = st.columns(2)
    with col1:
        tipologia = st.selectbox(
            "Tipología / Cabecera de tarifa *",
            tipologias or ["(no hay tarifas de esta agencia)"],
            help="Identifica la tarifa por su cabecera de texto.",
        )
        fecha = st.date_input("Fecha de envío *")
        material = st.text_input("Material / Tipo", help="MAMPARA, PALETS, BULTO… (Molartrans)")
    with col2:
        kilos = st.number_input("Peso facturable (kg)", min_value=0.0, step=0.5)
        bultos = st.number_input("Bultos", min_value=0, step=1)
        cp = st.text_input("CP destino")
        zona = st.text_input("Zona")

    st.markdown("---")
    if st.button("🧮 Calcular coste esperado", type="primary", use_container_width=True):
        db = SessionLocal()
        try:
            tarifa = find_tariff(db, ag, tipologia or None, str(fecha))
            if not tarifa:
                st.error(f"No hay tarifa activa para **{ag}** · {tipologia} en la fecha {fecha}.")
                otras = db.query(Tarifa).filter(Tarifa.agencia == ag).order_by(Tarifa.version.desc()).all()
                if otras:
                    st.info(f"Tarifas disponibles para {ag}:")
                    for t in otras:
                        st.caption(f"· {t.tipologia or '(sin tipología)'} · v{t.version} · {t.estado.value} · {t.fecha_inicio} → {t.fecha_fin or '∞'}")
            else:
                result = calculate_expected_amount(tarifa, {
                    "peso_facturable": kilos, "kilos": kilos, "zona": zona, "cp_destino": cp,
                    "material": material, "tramo_kg": int(kilos) if kilos else None,
                    "bultos": bultos or None,
                })
                if result.get("importe_calculado") is not None:
                    st.success(f"### Importe esperado: {result['importe_calculado']:.2f} €")
                    c1, c2, c3 = st.columns(3)
                    c1.metric("Portes base", f"{result.get('portes_calculado', 0):.2f} €")
                    c2.metric("Combustible", f"{result.get('combustible_calculado', 0):.2f} €")
                    c3.metric("Tasa energética", f"{result.get('tasa_energetica_calculada', 0):.2f} €")
                    st.caption(f"Tarifa aplicada: v{tarifa.version} · {tarifa.agencia} · {tarifa.fecha_inicio} → {tarifa.fecha_fin or '∞'}")
                    with st.expander("Ver detalle del cálculo"):
                        st.json(result)
                else:
                    st.warning(f"Tarifa encontrada (v{tarifa.version}) pero sin regla para zona='{zona}' y {kilos} kg.")
                    if tarifa.reglas_json:
                        with st.expander("Ver reglas de la tarifa"):
                            try:
                                st.json(json.loads(tarifa.reglas_json))
                            except Exception:
                                st.code(tarifa.reglas_json)
        finally:
            db.close()
