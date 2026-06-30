import streamlit as st
import pandas as pd
from database.db import SessionLocal
from database.models import Albaran
from exports.exporter import export_excel, export_csv

AGENCIAS = ["Molartrans", "DHL Parcel", "DHL Freight", "CEVA", "TDN", "DSV"]

ESTADO_COLOR = {
    "ALBARAN_OK":          "#f0fdf4",
    "PEDIDO_OK":           "#f0fdf4",
    "EXPEDICION_AGENCIA":  "#eff6ff",
    "SIN_REFERENCIA":      "#fef9c3",
    "DUDOSO":              "#fff7ed",
    "MANUAL":              "#f5f3ff",
    "ERROR_LECTURA":       "#fef2f2",
}

ESTADO_ICON = {
    "ALBARAN_OK":          "✅",
    "PEDIDO_OK":           "✅",
    "EXPEDICION_AGENCIA":  "🔵",
    "SIN_REFERENCIA":      "⚠️",
    "DUDOSO":              "🟠",
    "MANUAL":              "🟣",
    "ERROR_LECTURA":       "❌",
}

ESTADO_LABEL = {
    "ALBARAN_OK":          "✅ Albarán OK",
    "PEDIDO_OK":           "✅ Pedido OK",
    "EXPEDICION_AGENCIA":  "🔵 Solo ref. agencia",
    "SIN_REFERENCIA":      "⚠️ Sin referencia",
    "DUDOSO":              "🟠 Dudoso",
    "MANUAL":              "🟣 Manual",
    "ERROR_LECTURA":       "❌ Error lectura",
}


def render():
    st.title("Resultados")

    # ── Cargar todos los registros para los contadores de filtros ─────────────
    db = SessionLocal()
    with st.spinner("Cargando…"):
        all_records = db.query(Albaran).order_by(Albaran.fecha_carga.desc()).all()
    db.close()

    if not all_records:
        st.info("No hay facturas cargadas. Ve a '📤 Carga de facturas'.")
        return

    # ── Barra de búsqueda principal ───────────────────────────────────────────
    col_search, col_clear = st.columns([5, 1])
    with col_search:
        f_buscar = st.text_input(
            "🔍 Buscar",
            placeholder="Albarán Doccia, expedición, destinatario, factura…",
            key="res_search",
            label_visibility="collapsed",
        )
    with col_clear:
        if st.button("✕ Limpiar", use_container_width=True, key="res_clear"):
            for k in ["res_search", "res_ag", "res_estados", "res_fdesde", "res_fhasta"]:
                if k in st.session_state:
                    del st.session_state[k]
            st.rerun()

    st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)

    # ── Filtros secundarios en una fila ───────────────────────────────────────
    fc1, fc2, fc3, fc4 = st.columns([1.2, 1.5, 1, 1])

    with fc1:
        st.caption("Transportista")
        agencias_disponibles = sorted({r.agencia for r in all_records if r.agencia})
        f_agencia = st.selectbox(
            "Transportista",
            ["Todos"] + agencias_disponibles,
            key="res_ag",
            label_visibility="collapsed",
        )

    with fc2:
        st.caption("Estado")
        estados_disponibles = sorted({r.estado_cruce for r in all_records if r.estado_cruce})
        opciones_estado = [ESTADO_LABEL.get(e, e) for e in estados_disponibles]
        f_estados_labels = st.multiselect(
            "Estado",
            opciones_estado,
            key="res_estados",
            label_visibility="collapsed",
            placeholder="Todos los estados",
        )
        label_a_estado = {v: k for k, v in ESTADO_LABEL.items()}
        f_estados = [label_a_estado.get(l, l) for l in f_estados_labels]

    with fc3:
        st.caption("Fecha desde")
        f_fecha_desde = st.date_input("Fecha desde", value=None, key="res_fdesde", label_visibility="collapsed")

    with fc4:
        st.caption("Fecha hasta")
        f_fecha_hasta = st.date_input("Fecha hasta", value=None, key="res_fhasta", label_visibility="collapsed")

    # ── Aplicar filtros ───────────────────────────────────────────────────────
    records = all_records
    if f_agencia != "Todos":
        records = [r for r in records if r.agencia == f_agencia]
    if f_estados:
        records = [r for r in records if r.estado_cruce in f_estados]
    if f_fecha_desde:
        records = [r for r in records if (r.fecha_envio or "") >= str(f_fecha_desde)]
    if f_fecha_hasta:
        records = [r for r in records if (r.fecha_envio or "") <= str(f_fecha_hasta)]

    rows = [{
        "ID": r.id,
        "": ESTADO_ICON.get(r.estado_cruce or "", ""),
        "Agencia": r.agencia or "",
        "Factura": r.factura or "",
        "Fecha envío": r.fecha_envio or "",
        "Expedición": r.expedicion_agencia or "",
        "Albarán Doccia": r.albaran_doccia or "",
        "Pedido Doccia": r.pedido_doccia or "",
        "Destinatario": r.destinatario or "",
        "Destino": r.destino or "",
        "Bultos": r.bultos,
        "Kg": r.kilos,
        "Portes €": r.portes,
        "Total €": r.total_facturado,
        "Estado": r.estado_cruce or "",
        "Observaciones": r.observaciones or "",
    } for r in records]

    # Búsqueda libre sobre los resultados ya filtrados
    if f_buscar:
        term = f_buscar.lower()
        rows = [r for r in rows if any(
            term in str(r.get(col, "")).lower()
            for col in ["Albarán Doccia", "Expedición", "Pedido Doccia", "Destinatario", "Factura"]
        )]

    # ── Indicador de filtros activos ──────────────────────────────────────────
    filtros_activos = []
    if f_agencia != "Todos":
        filtros_activos.append(f"**Agencia:** {f_agencia}")
    if f_estados_labels:
        filtros_activos.append(f"**Estado:** {', '.join(f_estados_labels)}")
    if f_fecha_desde:
        filtros_activos.append(f"**Desde:** {f_fecha_desde}")
    if f_fecha_hasta:
        filtros_activos.append(f"**Hasta:** {f_fecha_hasta}")
    if f_buscar:
        filtros_activos.append(f'**Búsqueda:** "{f_buscar}"')

    if filtros_activos:
        st.markdown(
            f"<div style='background:#f0f4ff;border:1px solid #d1d9f8;border-radius:8px;padding:8px 14px;"
            f"font-size:0.82rem;color:#4f63d2;margin:6px 0'>"
            f"Filtros activos: {' · '.join(filtros_activos)} "
            f"<span style='color:#9ca3af'>({len(rows)} de {len(all_records)} registros)</span></div>",
            unsafe_allow_html=True
        )

    st.markdown("---")

    if not rows:
        st.info("No hay registros con los filtros aplicados.")
        return

    df = pd.DataFrame(rows)

    # ── KPIs ──────────────────────────────────────────────────────────────────
    ok = len(df[df["Estado"].isin(["ALBARAN_OK", "PEDIDO_OK"])])
    err = len(df[df["Estado"].isin(["ERROR_LECTURA", "SIN_REFERENCIA"])])
    total_eur = df["Total €"].sum() if "Total €" in df else 0

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Registros", len(rows))
    k2.metric("✅ Cruzados OK", ok)
    k3.metric("⚠️ Con incidencia", err)
    k4.metric("Total facturado", f"{total_eur:,.2f} €" if total_eur else "—")

    # ── Tabla ─────────────────────────────────────────────────────────────────
    def color_row(row):
        color = ESTADO_COLOR.get(row.get("Estado", ""), "")
        return [f"background-color:{color}"] * len(row) if color else [""] * len(row)

    st.dataframe(
        df.style.apply(color_row, axis=1),
        use_container_width=True,
        hide_index=True,
        height=min(600, 50 + len(rows) * 35),
    )

    # ── Exportación ───────────────────────────────────────────────────────────
    st.markdown("---")
    col_ex1, col_ex2, col_void = st.columns([1, 1, 3])
    clean = [{k: v for k, v in r.__dict__.items() if not k.startswith("_")} for r in records]

    with col_ex1:
        if st.button("📥 Exportar Excel", use_container_width=True):
            path = export_excel(clean)
            with open(path, "rb") as f:
                st.download_button("⬇️ Descargar Excel", f.read(), file_name=path.name,
                                   mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                   use_container_width=True)
    with col_ex2:
        if st.button("📄 Exportar CSV", use_container_width=True):
            path = export_csv(clean)
            with open(path, "rb") as f:
                st.download_button("⬇️ Descargar CSV", f.read(), file_name=path.name,
                                   mime="text/csv", use_container_width=True)
