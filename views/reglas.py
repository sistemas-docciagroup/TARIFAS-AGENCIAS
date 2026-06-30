import streamlit as st
from sqlalchemy import func
from database.db import SessionLocal
from database.models import Albaran, Tarifa
from parsers.agency_meta import AGENCY_META, ESTADO_BADGE


def _chip(text, color, bg, border):
    return (
        f"<span style='display:inline-block;background:{bg};color:{color};"
        f"border:1px solid {border};border-radius:999px;padding:2px 10px;"
        f"font-size:0.72rem;font-weight:600;margin:2px 4px 2px 0'>{text}</span>"
    )


def render():
    st.title("⚙️ Reglas de proceso por agencia")
    st.caption(
        "Cómo procesa el sistema cada agencia: detección, extracción, reglas "
        "especiales y tarificación. Esta vista refleja la lógica real del código "
        "(fuente única en `parsers/agency_meta.py`)."
    )

    # ── Conteos en BD por agencia ─────────────────────────────────────────────
    db = SessionLocal()
    try:
        fac_counts = dict(
            db.query(Albaran.agencia, func.count(func.distinct(Albaran.factura)))
            .group_by(Albaran.agencia).all()
        )
        alb_counts = dict(
            db.query(Albaran.agencia, func.count(Albaran.id))
            .group_by(Albaran.agencia).all()
        )
        tar_counts = dict(
            db.query(Tarifa.agencia, func.count(Tarifa.tarifa_id))
            .group_by(Tarifa.agencia).all()
        )
    finally:
        db.close()

    # ── Resumen superior ──────────────────────────────────────────────────────
    n_val = sum(1 for m in AGENCY_META.values() if m["estado"] == "validado")
    n_dev = sum(1 for m in AGENCY_META.values() if m["estado"] == "desarrollo")
    c1, c2, c3 = st.columns(3)
    c1.markdown(f"<div style='font-size:0.8rem;color:#6b7280'>Agencias</div>"
                f"<div style='font-size:1.4rem;font-weight:700'>{len(AGENCY_META)}</div>",
                unsafe_allow_html=True)
    c2.markdown(f"<div style='font-size:0.8rem;color:#6b7280'>✅ Validadas</div>"
                f"<div style='font-size:1.4rem;font-weight:700;color:#16a34a'>{n_val}</div>",
                unsafe_allow_html=True)
    c3.markdown(f"<div style='font-size:0.8rem;color:#6b7280'>🚧 En desarrollo</div>"
                f"<div style='font-size:1.4rem;font-weight:700;color:#c2410c'>{n_dev}</div>",
                unsafe_allow_html=True)

    st.markdown("---")

    # ── Tarjeta por agencia ───────────────────────────────────────────────────
    for agencia, m in AGENCY_META.items():
        icon, label, color, bg, border = ESTADO_BADGE.get(
            m["estado"], ("•", m["estado"], "#374151", "#f3f4f6", "#d1d5db"))
        n_fac = fac_counts.get(agencia, 0)
        n_alb = alb_counts.get(agencia, 0)
        n_tar = tar_counts.get(agencia, 0)

        titulo = (f"{icon} **{agencia}** — {label}  ·  "
                  f"{n_fac} factura(s) · {n_alb:,} albaranes · {n_tar} tarifa(s)")

        with st.expander(titulo, expanded=(m["estado"] == "validado")):
            # Estado + formatos
            chips = _chip(f"{icon} {label}", color, bg, border)
            for fmt in m["formatos"]:
                chips += _chip(fmt, "#4f63d2", "#eef1ff", "#c7d0f7")
            st.markdown(chips, unsafe_allow_html=True)

            # ── BLOQUE 1: reglas de proceso de la FACTURA ─────────────────────
            st.markdown(
                "<div style='background:#eef1ff;border-left:4px solid #4f63d2;"
                "border-radius:6px;padding:8px 12px;margin:10px 0 6px;font-weight:700;"
                "color:#3a47a8'>📥 Reglas de proceso de la FACTURA</div>",
                unsafe_allow_html=True)
            st.markdown(
                "**🔎 Detección** — se reconoce si el PDF/archivo contiene: "
                + ", ".join(f"`{k}`" for k in m["keywords"])
            )
            st.markdown(f"**📄 Formatos:** {', '.join(m['formatos'])}")
            st.markdown(f"**⚙️ Extracción** — {m['extraccion']}")
            st.markdown("**🧾 Columnas que extrae**")
            st.markdown(" ".join(_chip(c, "#374151", "#f3f4f6", "#e5e7eb")
                                 for c in m["columnas"]), unsafe_allow_html=True)
            if m["reglas_especiales"]:
                st.markdown("**📌 Reglas especiales de lectura**")
                for r in m["reglas_especiales"]:
                    st.markdown(f"- {r}")

            # ── BLOQUE 2: reglas de proceso de la TARIFA ──────────────────────
            st.markdown(
                "<div style='background:#f0fdf4;border-left:4px solid #16a34a;"
                "border-radius:6px;padding:8px 12px;margin:14px 0 6px;font-weight:700;"
                "color:#15803d'>💰 Reglas de proceso de la TARIFA</div>",
                unsafe_allow_html=True)
            st.markdown(
                "**🏷️ Asociación** — cada tarifa se identifica por su **tipología "
                "(cabecera de texto)** y se asocia al albarán cuyo producto coincide."
            )
            st.markdown(f"**🧮 Estructura / cálculo** — {m['tarifa']}")
            st.markdown(f"**⚖️ Audita comparando contra:** {m['compara_contra']}")
            st.markdown(f"**🗂️ Extracción automática de la tarifa:** {m['tarifa_auto']}")

            if m["estado"] != "validado":
                st.info(
                    "🚧 Parser implementado pero **pendiente de validar con una factura "
                    "real** y/o de definir la estructura de tarifa. Sube una factura de "
                    "esta agencia y revisaremos juntos el resultado."
                )
