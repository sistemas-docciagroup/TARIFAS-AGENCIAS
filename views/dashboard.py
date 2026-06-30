import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from database.db import SessionLocal
from database.models import Albaran

ESTADO_COLORS = {
    "ALBARAN_OK":          "#22c55e",
    "PEDIDO_OK":           "#4ade80",
    "EXPEDICION_AGENCIA":  "#3b82f6",
    "SIN_REFERENCIA":      "#eab308",
    "DUDOSO":              "#f97316",
    "MANUAL":              "#a855f7",
    "ERROR_LECTURA":       "#ef4444",
}


def render():
    st.title("Dashboard")

    db = SessionLocal()
    with st.spinner("Cargando estadísticas…"):
        records = db.query(Albaran).all()
    db.close()

    if not records:
        st.info("No hay datos. Sube facturas desde '📤 Carga de facturas'.")
        return

    df = pd.DataFrame([{
        "agencia": r.agencia or "Desconocida",
        "fecha_envio": r.fecha_envio,
        "estado_cruce": r.estado_cruce or "SIN_ESTADO",
        "total_facturado": r.total_facturado or 0,
        "destinatario": r.destinatario or "",
        "destino": r.destino or "",
        "bultos": r.bultos or 0,
    } for r in records])

    # KPIs globales
    k1, k2, k3, k4, k5 = st.columns(5)
    k1.metric("Total albaranes", len(df))
    k2.metric("Agencias", df["agencia"].nunique())
    k3.metric("✅ Cruzados OK", len(df[df["estado_cruce"].isin(["ALBARAN_OK", "PEDIDO_OK"])]))
    k4.metric("⚠️ Con incidencia", len(df[~df["estado_cruce"].isin(["ALBARAN_OK", "PEDIDO_OK", "EXPEDICION_AGENCIA"])]))
    k5.metric("Total facturado", f"{df['total_facturado'].sum():,.2f} €")

    st.markdown("---")
    col1, col2 = st.columns(2)

    # Facturas por agencia
    with col1:
        st.markdown("**Albaranes por agencia**")
        ag_count = df.groupby("agencia").size().reset_index(name="count")
        fig = px.bar(ag_count, x="agencia", y="count", color="agencia",
                     labels={"agencia": "Agencia", "count": "Nº albaranes"},
                     color_discrete_sequence=px.colors.qualitative.Set2)
        fig.update_layout(showlegend=False, height=320, margin=dict(t=10, b=10))
        st.plotly_chart(fig, use_container_width=True)

    # Estados de cruce
    with col2:
        st.markdown("**Estados de cruce**")
        est_count = df.groupby("estado_cruce").size().reset_index(name="count")
        colors = [ESTADO_COLORS.get(e, "#94a3b8") for e in est_count["estado_cruce"]]
        fig2 = px.pie(est_count, names="estado_cruce", values="count",
                      color="estado_cruce",
                      color_discrete_map=ESTADO_COLORS,
                      hole=0.4)
        fig2.update_layout(height=320, margin=dict(t=10, b=10))
        st.plotly_chart(fig2, use_container_width=True)

    # Evolución mensual
    st.markdown("**Evolución mensual — Total facturado €**")
    df_fecha = df[df["fecha_envio"].notna()].copy()
    if not df_fecha.empty:
        df_fecha["mes"] = df_fecha["fecha_envio"].str[:7]
        monthly = df_fecha.groupby(["mes", "agencia"])["total_facturado"].sum().reset_index()
        fig3 = px.bar(monthly, x="mes", y="total_facturado", color="agencia",
                      labels={"mes": "Mes", "total_facturado": "€", "agencia": "Agencia"},
                      barmode="stack",
                      color_discrete_sequence=px.colors.qualitative.Set2)
        fig3.update_layout(height=340, margin=dict(t=10, b=10))
        st.plotly_chart(fig3, use_container_width=True)
    else:
        st.info("No hay datos de fecha de envío para la evolución mensual.")

    # Top destinatarios
    col3, col4 = st.columns(2)
    with col3:
        st.markdown("**Top 10 destinatarios (por nº albaranes)**")
        top_dest = df[df["destinatario"] != ""].groupby("destinatario").size().nlargest(10).reset_index(name="count")
        fig4 = px.bar(top_dest, x="count", y="destinatario", orientation="h",
                      labels={"count": "Albaranes", "destinatario": ""},
                      color_discrete_sequence=["#4f63d2"])
        fig4.update_layout(height=340, margin=dict(t=10, b=10), yaxis={"categoryorder": "total ascending"})
        st.plotly_chart(fig4, use_container_width=True)

    with col4:
        st.markdown("**Importe medio por agencia €**")
        avg_ag = df[df["total_facturado"] > 0].groupby("agencia")["total_facturado"].mean().reset_index()
        avg_ag.columns = ["agencia", "importe_medio"]
        fig5 = px.bar(avg_ag, x="agencia", y="importe_medio", color="agencia",
                      labels={"importe_medio": "€ medio", "agencia": ""},
                      color_discrete_sequence=px.colors.qualitative.Pastel)
        fig5.update_layout(showlegend=False, height=340, margin=dict(t=10, b=10))
        st.plotly_chart(fig5, use_container_width=True)
