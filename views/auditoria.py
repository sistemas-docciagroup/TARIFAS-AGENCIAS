import re
import pandas as pd
import streamlit as st
from database.db import SessionLocal
from database.models import Albaran, Tarifa
from services.tariff_engine import calculate_expected_amount, compare_amounts
from exports.exporter import export_excel

_MAT_RE   = re.compile(r'Tipo:\s*(MAMPARA|PALETS?|BULTO|PAQUETE)', re.I)
_HASTA_RE = re.compile(r'hasta\s+(\d+)', re.I)
_CP_RE    = re.compile(r'\((\d{5}|\d{7})\)')   # 5 díg España · 7 díg Portugal


def _mejor_tarifa(tarifas, line_data: dict, portes_real: float):
    """
    Prueba la línea contra varias tarifas y elige la mejor:
      1) la que da un precio que CUADRA con los portes (±2%),
      2) si ninguna cuadra, la primera que al menos da un precio,
      3) si ninguna da precio, sin tarifa.
    Devuelve (calc, tarifa_id).
    """
    primera_con_precio = None
    for t in tarifas:
        calc = calculate_expected_amount(t, line_data)
        imp = calc.get("importe_calculado")
        if imp is None:
            continue
        if abs(imp - (portes_real or 0)) <= max(0.02, abs(imp) * 0.02):
            return calc, t.tarifa_id          # cuadra → la elegimos
        if primera_con_precio is None:
            primera_con_precio = (calc, t.tarifa_id)
    if primera_con_precio:
        return primera_con_precio
    return {"importe_calculado": None, "estado": "SIN_TARIFA",
            "motivo": "ninguna tarifa de la agencia aplica"}, None


def _line_audit_data(l: Albaran) -> dict:
    """Extrae material, tramo_kg y CP destino del albarán para el motor."""
    obs = l.observaciones or ""
    material = ""
    mm = _MAT_RE.search(obs)
    if mm:
        material = "PALETS" if mm.group(1).upper().startswith("PALET") else mm.group(1).upper()
    tramo_kg = None
    mh = _HASTA_RE.search(obs)
    if mh:
        tramo_kg = int(mh.group(1))
    elif l.kilos:
        tramo_kg = int(l.kilos)
    cp = ""
    mc = _CP_RE.search(l.destino or "")
    if mc:
        cp = mc.group(1)

    # Peso REAL desde SAP (el de la factura Molartrans no es fiable). Si SAP lo da,
    # manda y se usa como tramo → la auditoría es objetiva, sin estimar por importe.
    from services.sap_client import get_peso
    peso_sap = get_peso(l.albaran_doccia, l.agencia)
    peso_por_bulto = peso_sap if (peso_sap is not None and peso_sap > 0) else 20
    tramo_kg = peso_por_bulto * (l.bultos or 1)

    return {
        "material":        material,
        "tramo_kg":        tramo_kg,
        "bultos":          l.bultos,
        "cp_destino":      cp,
        "destino":         l.destino,      # DHL: ciudad → provincia → zona
        "albaran":         l.albaran_doccia,   # para consultar CP/peso en SAP
        "agencia":         l.agencia,
        "importe_real":    l.portes,       # desambiguar ciudad/tramo por descarte (provisional)
        "peso_sap":        peso_sap,       # None hasta conectar SAP
        "kilos":           l.kilos,
        "peso_facturable": l.peso_facturable,
        "zona":            None,
    }

ESTADO_BG = {
    "TARIFA_OK":          "#f0fdf4",
    "DIFERENCIA_CONTRA":  "#fef2f2",   # cobrado de más → rojo suave
    "DIFERENCIA_FAVOR":   "#fff7ed",   # cobrado de menos → naranja suave
    "SIN_TARIFA":         "#fef9c3",
}
ESTADO_ICON = {
    "TARIFA_OK":          "✅",
    "DIFERENCIA_CONTRA":  "🔴",        # nos cobraron de más
    "DIFERENCIA_FAVOR":   "🟡",        # nos cobraron de menos
    "SIN_TARIFA":         "❓",
}


def _kpi(label, value, sub=None, color="#1a1f36", bg="#fff", border="#e8ebf3"):
    sub_html = f"<div style='font-size:0.75rem;color:#6b7280;margin-top:3px'>{sub}</div>" if sub else ""
    return (
        f"<div style='background:{bg};border:1px solid {border};border-radius:12px;"
        f"padding:14px 18px;'>"
        f"<div style='font-size:0.72rem;font-weight:600;color:#9ca3af;text-transform:uppercase;"
        f"letter-spacing:.5px;margin-bottom:6px;white-space:nowrap'>{label}</div>"
        f"<div style='font-size:1.25rem;font-weight:700;color:{color};white-space:nowrap'>{value}</div>"
        f"{sub_html}</div>"
    )


def render():
    st.title("🔍 Auditoría — Factura vs Tarifa")

    db = SessionLocal()
    try:
        # ── Selector factura ──────────────────────────────────────────────────
        facturas_raw = (
            db.query(Albaran.factura, Albaran.agencia)
            .distinct().order_by(Albaran.factura.desc()).all()
        )
        if not facturas_raw:
            st.info("No hay facturas cargadas. Sube alguna desde '📤 Carga de facturas'.")
            return

        col_fac, col_tar, col_btn = st.columns([2, 2, 1])

        with col_fac:
            st.caption("Factura a auditar")
            fac_opts = {
                f"{f.agencia}  ·  {f.factura}": (f.factura, f.agencia)
                for f in facturas_raw if f.factura
            }
            fac_sel     = st.selectbox("Factura", list(fac_opts.keys()),
                                       label_visibility="collapsed", key="aud_fac")
            factura_sel, agencia_sel = fac_opts[fac_sel]

        # Tarifas filtradas por agencia
        tarifas_agencia = db.query(Tarifa).filter(
            Tarifa.agencia == agencia_sel
        ).order_by(Tarifa.version.desc()).all()

        with col_tar:
            st.caption(f"Tarifa de {agencia_sel}")
            if not tarifas_agencia:
                st.warning(f"No hay tarifas de {agencia_sel}. Ve a 💰 Tarifas.")
                tar_sel_id = None
            else:
                # Opción especial: buscar en TODAS las tarifas de la agencia
                opt_todas = f"🔁 Todas las de {agencia_sel} (buscar la que cuadre)"
                tar_opts = {opt_todas: "ALL"}
                tar_opts.update({
                    f"{t.tipologia or '(sin tipología)'}  ·  v{t.version}"
                    f"  ·  {t.estado.value if hasattr(t.estado,'value') else t.estado}"
                    f"  ·  {t.fecha_inicio} → {t.fecha_fin or '∞'}": t.tarifa_id
                    for t in tarifas_agencia
                })
                tar_sel     = st.selectbox("Tarifa", list(tar_opts.keys()),
                                           label_visibility="collapsed", key="aud_tar")
                tar_sel_id  = tar_opts[tar_sel]

        lineas = db.query(Albaran).filter(Albaran.factura == factura_sel).all()

        with col_btn:
            st.caption(" ")
            do_audit = st.button(
                "🔍 Auditar", type="primary", use_container_width=True,
                disabled=(not lineas or not tarifas_agencia)
            )

        # Fallback: si la tarifa marcada no cuadra una línea, buscar en las demás
        fallback_todas = st.checkbox(
            f"Si la tarifa marcada no cuadra una línea, buscar en todas las de {agencia_sel}",
            value=True, key="aud_fallback",
        )

        st.markdown("---")

        # ── Ejecutar auditoría ────────────────────────────────────────────────
        audit_key = f"aud_{factura_sel}_{tar_sel_id}"

        if do_audit and lineas and tar_sel_id:
            estructuradas = [t for t in tarifas_agencia
                             if t.reglas_json and '"tipo_tarifa"' in (t.reglas_json or "")]
            if tar_sel_id == "ALL":
                # Modo "todas" puro: prueba todas, sin tarifa principal
                orden = estructuradas
                modo_unico = False
            else:
                sel = db.query(Tarifa).filter(Tarifa.tarifa_id == tar_sel_id).first()
                if fallback_todas:
                    # La marcada PRIMERO; el resto como respaldo si no cuadra
                    otras = [t for t in estructuradas if t.tarifa_id != tar_sel_id]
                    orden = [sel] + otras
                    modo_unico = False
                else:
                    orden = [sel]
                    modo_unico = True
            bar = st.progress(0, text="Auditando…")
            n   = len(lineas)
            for i, l in enumerate(lineas):
                bar.progress(int((i + 1) / n * 95), text=f"Línea {i+1} de {n}…")
                ld = _line_audit_data(l)
                if modo_unico:
                    calc = calculate_expected_amount(orden[0], ld)
                    tar_id = tar_sel_id
                else:
                    calc, tar_id = _mejor_tarifa(orden, ld, l.portes or 0)
                # La tarifa da el PORTE base → comparamos contra portes, no el total
                cmp = compare_amounts(l.portes or 0, calc.get("importe_calculado"))
                l.tarifa_id             = tar_id
                l.importe_tarifa        = calc.get("importe_calculado")
                l.diferencia_importe    = cmp.get("diferencia")
                l.porcentaje_diferencia = cmp.get("porcentaje")
                l.estado_tarifa         = cmp.get("estado")
            db.commit()
            lineas = db.query(Albaran).filter(Albaran.factura == factura_sel).all()
            bar.progress(100, text="Completado")
            bar.empty()
            st.session_state[audit_key] = True

        # ── Sin auditoría: mostrar extracto ──────────────────────────────────
        if not st.session_state.get(audit_key):
            total_fac = sum(l.total_facturado or 0 for l in lineas)
            st.markdown(f"**{agencia_sel} · Factura {factura_sel} · {len(lineas):,} albaranes · {total_fac:,.2f} € facturado**")
            df_prev = pd.DataFrame([{
                "Expedición":     l.expedicion_agencia or "—",
                "Albarán Doccia": l.albaran_doccia or "—",
                "Fecha":          l.fecha_envio or "—",
                "Destinatario":   l.destinatario or "—",
                "Destino":        l.destino or "—",
                "Bultos":         l.bultos,
                "Kg":             l.kilos,
                "Portes €":       round(l.portes or 0, 2),
                "Seguro €":       round(l.seguro or 0, 2),
                "Total €":        round(l.total_facturado or 0, 2),
            } for l in lineas])
            st.dataframe(df_prev, use_container_width=True, hide_index=True,
                         height=min(500, 55 + len(lineas) * 35))
            if tarifas_agencia:
                st.info("Selecciona una tarifa y pulsa **🔍 Auditar** para ver el cruce completo.")
            return

        # ── KPIs del resultado ────────────────────────────────────────────────
        # La tarifa calcula el PORTE base, así que comparamos PORTES vs tarifa, y
        # solo sobre las líneas que tienen tarifa (mismo conjunto en ambos lados).
        # El seguro/reexpedición/otros NO entran en la comparación.
        lineas_aud = [l for l in lineas if l.importe_tarifa is not None]
        portes_aud = sum(l.portes or 0 for l in lineas_aud)
        total_tar  = sum(l.importe_tarifa or 0 for l in lineas_aud)
        dif_neta   = portes_aud - total_tar
        total_fac_full = sum(l.total_facturado or 0 for l in lineas)  # contexto
        n_ok       = sum(1 for l in lineas if l.estado_tarifa == "TARIFA_OK")
        n_contra   = sum(1 for l in lineas if l.estado_tarifa == "DIFERENCIA_CONTRA")
        n_favor    = sum(1 for l in lineas if l.estado_tarifa == "DIFERENCIA_FAVOR")
        n_dif      = n_contra + n_favor
        n_sin      = sum(1 for l in lineas if l.estado_tarifa == "SIN_TARIFA")
        pct_ok     = f"{n_ok / len(lineas) * 100:.1f}%" if lineas else "—"

        dif_color  = "#16a34a" if dif_neta <= 0.01 else "#dc2626"
        dif_bg     = "#f0fdf4" if dif_neta <= 0.01 else "#fef2f2"
        dif_border = "#86efac" if dif_neta <= 0.01 else "#fca5a5"

        c1, c2, c3, c4 = st.columns(4)
        c1.markdown(_kpi("Albaranes auditados", f"{len(lineas_aud):,}",
                         sub=f"de {len(lineas):,} · {factura_sel}"), unsafe_allow_html=True)
        c2.markdown(_kpi("Portes facturados", f"{portes_aud:,.2f} €",
                         sub="solo líneas con tarifa"), unsafe_allow_html=True)
        c3.markdown(_kpi("Portes según tarifa", f"{total_tar:,.2f} €"), unsafe_allow_html=True)
        c4.markdown(_kpi("Diferencia neta", f"{dif_neta:+,.2f} €",
                         sub="portes facturados − tarifa",
                         color=dif_color, bg=dif_bg, border=dif_border), unsafe_allow_html=True)

        st.caption(
            f"ℹ️ La comparación es **portes vs tarifa** (la tarifa calcula el porte base). "
            f"El total de la factura es {total_fac_full:,.2f} € e incluye además seguro, "
            f"reexpedición y otros, que no entran en el cruce de tarifa."
        )

        st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
        c5, c6, c7, c8 = st.columns(4)
        c5.markdown(_kpi("✅ Conformes", f"{n_ok:,}", sub=pct_ok,
                         bg="#f0fdf4", border="#86efac", color="#16a34a"), unsafe_allow_html=True)
        c6.markdown(_kpi("🔴 Cobrado de más", f"{n_contra:,}",
                         sub="facturado > tarifa",
                         bg="#fef2f2", border="#fca5a5", color="#dc2626"), unsafe_allow_html=True)
        c7.markdown(_kpi("🟡 Cobrado de menos", f"{n_favor:,}",
                         sub="facturado < tarifa",
                         bg="#fff7ed", border="#fdba74", color="#c2410c"), unsafe_allow_html=True)
        c8.markdown(_kpi("❓ Sin regla de tarifa", f"{n_sin:,}",
                         bg="#fef9c3", border="#fde047", color="#854d0e"), unsafe_allow_html=True)

        if n_sin == len(lineas) and total_tar == 0:
            st.warning(
                "⚠️ La tarifa seleccionada no tiene reglas de cálculo definidas (`tramos`). "
                "Si la subiste como PDF, el sistema guarda el archivo como referencia visual "
                "pero no puede calcular importes automáticamente. "
                "Para el cruce automático necesitas subir la tarifa en **Excel o CSV** con las columnas: "
                "`zona`, `desde` (kg), `hasta` (kg), `precio` o `precio_kg`."
            )

        # ── Sumas de conceptos (toda la factura) ─────────────────────────────
        s_portes = sum(l.portes or 0 for l in lineas)
        s_seguro = sum(l.seguro or 0 for l in lineas)
        s_reexp  = sum(l.reexpedicion or 0 for l in lineas)
        s_otros  = sum(l.otros or 0 for l in lineas)
        s_comb   = sum(l.combustible or 0 for l in lineas)
        s_total  = sum(l.total_facturado or 0 for l in lineas)
        s_resto  = s_seguro + s_reexp + s_otros + s_comb     # todo lo que no es porte

        # ── Desglose de "Otros" en DHL: combustible (% oficial DHL) + resto ──────
        # "Otros" = recargo de combustible (% mensual oficial sobre Portes+Reexped,
        # distinto doméstico/internacional) + contrareembolso / suplemento intl.
        from services.dhl_fuel import get_fuel_pct, meses_faltantes, set_fuel_pct, es_asumido, month_key
        from services.geo_es import es_internacional

        es_dhl = agencia_sel == "DHL Parcel" and s_otros > 0
        faltan_meses = meses_faltantes([l.fecha_envio for l in lineas]) if es_dhl else []
        meses_asumidos = sorted({month_key(l.fecha_envio) for l in lineas
                                 if es_dhl and es_asumido(l.fecha_envio)}) if es_dhl else []

        # Aviso + editor inline si falta el % de algún mes (para que siempre cuadre)
        if es_dhl and faltan_meses:
            st.error(
                "⛔ **Falta el % de recargo de combustible de DHL** para "
                f"**{', '.join(faltan_meses)}**. Introdúcelo (lo publica DHL cada mes) "
                "para que el desglose de 'Otros' sea correcto:"
            )
            for mk in faltan_meses:
                cda, cdb, cdc, _ = st.columns([1.3, 1, 1, 1.4])
                cda.markdown(f"**Mes {mk}**")
                dom = cdb.number_input(f"Doméstico % ({mk})", min_value=0.0, max_value=100.0,
                                       step=0.25, key=f"fuel_dom_{mk}", label_visibility="collapsed")
                intl = cdc.number_input(f"Internacional % ({mk})", min_value=0.0, max_value=100.0,
                                        step=0.25, key=f"fuel_int_{mk}", label_visibility="collapsed")
                if cda.button(f"💾 Guardar {mk}", key=f"fuel_save_{mk}"):
                    set_fuel_pct(mk, dom, intl)
                    st.rerun()
            st.caption("Doméstico = envíos a España · Internacional = Portugal/Francia/Italia. "
                       "Fuente: dhl.com → fuel surcharge.")

        s_comb_est = s_cod_est = s_pend_est = 0.0
        fuel_linea = {}   # id → (combustible, resto)
        if es_dhl:
            for l in lineas:
                oe = l.otros or 0
                if not oe:
                    continue
                p = get_fuel_pct(l.fecha_envio, es_internacional(l.destino))
                if p is None:                      # mes sin % → pendiente
                    s_pend_est += oe
                    continue
                base = (l.portes or 0) + (l.reexpedicion or 0)
                comb = round(min(base * p, oe), 2)
                resto = round(oe - comb, 2)
                fuel_linea[l.id] = (comb, resto)
                s_comb_est += comb
                s_cod_est  += resto

        def _line(lbl, val, color="#1a1f36", strong=False):
            w = "700" if strong else "600"
            return (f"<div style='display:flex;justify-content:space-between;padding:4px 0'>"
                    f"<span style='color:#4b5563;font-size:0.86rem'>{lbl}</span>"
                    f"<span style='color:{color};font-weight:{w};font-size:0.9rem'>{val:,.2f} €</span></div>")

        def _panel(titulo, sub, cuerpo_html, accent):
            return (f"<div style='flex:1;min-width:300px;background:#fff;border:1px solid #e8ebf3;"
                    f"border-top:3px solid {accent};border-radius:12px;padding:14px 18px'>"
                    f"<div style='font-weight:700;color:#1a1f36;font-size:0.95rem'>{titulo}</div>"
                    f"<div style='color:#9ca3af;font-size:0.72rem;margin-bottom:8px'>{sub}</div>"
                    f"{cuerpo_html}</div>")

        dif_p = portes_aud - total_tar
        col_p = "#16a34a" if dif_p <= 0.01 else "#dc2626"

        # Comparativa 1 — PORTES vs tarifa
        cuerpo1 = (
            _line("Portes facturados", portes_aud) +
            _line("Portes según tarifa", total_tar) +
            "<hr style='border:none;border-top:1px solid #eef0f6;margin:6px 0'>" +
            _line("Diferencia", dif_p, color=col_p, strong=True)
        )
        # Comparativa 2 — el resto de conceptos (no tarifables)
        cuerpo2 = ""
        if s_comb:
            cuerpo2 += _line("Combustible / RC", s_comb)
        if s_seguro:
            cuerpo2 += _line("Seguro", s_seguro)
        if s_reexp:
            cuerpo2 += _line("Reexpedición", s_reexp)
        if es_dhl:
            # % oficiales DHL de los meses de la factura + % efectivo sobre portes
            from services.dhl_fuel import meses_disponibles
            _data_f = meses_disponibles()
            _meses_fac = sorted({month_key(l.fecha_envio) for l in lineas if l.fecha_envio})
            def _pl(vals):
                return "/".join(f"{v:g}".replace(".", ",") for v in vals)
            _dom = sorted({_data_f[m]["domestico"] for m in _meses_fac if m in _data_f})
            _int = sorted({_data_f[m]["internacional"] for m in _meses_fac if m in _data_f})
            comb_ef = f"{s_comb_est / s_portes * 100:.1f}".replace(".", ",") if s_portes else "0"
            cod_ef  = f"{s_cod_est / s_portes * 100:.1f}".replace(".", ",") if s_portes else "0"
            rate_txt = f"{_pl(_dom)}% nac" + (f" · {_pl(_int)}% int" if _int else "")

            # "Otros" desglosado con el % oficial de DHL del mes
            cuerpo2 += (
                f"<div style='font-size:0.78rem;color:#9ca3af;margin:4px 0 2px'>Otros, desglosado:</div>"
                + _line(f"&nbsp;&nbsp;· Combustible · {rate_txt} (≈{comb_ef}% s/portes)", s_comb_est)
                + _line(f"&nbsp;&nbsp;· Contrareembolso · 1–5% valor decl. (≈{cod_ef}% s/portes)", s_cod_est)
            )
            if s_pend_est:
                cuerpo2 += _line("&nbsp;&nbsp;· Pendiente (mes sin %)", s_pend_est, color="#dc2626")
            cuerpo2 += _line("&nbsp;&nbsp;Otros (total)", s_otros, color="#6b7280")
        else:
            cuerpo2 += _line("Otros (suplementos)", s_otros)
        cuerpo2 += (
            "<hr style='border:none;border-top:1px solid #eef0f6;margin:6px 0'>" +
            _line("Suma resto de conceptos", s_resto, color="#4f63d2", strong=True)
        )

        st.markdown("<div style='height:14px'></div>", unsafe_allow_html=True)
        st.markdown("#### Dos comparativas")
        panels = (
            _panel("① Portes — facturado vs tarifa", "lo que se puede auditar contra la tarifa",
                   cuerpo1, col_p) +
            _panel("② Resto de conceptos — facturado", "seguro, reexpedición y otros (sin tarifa que comparar)",
                   cuerpo2, "#4f63d2")
        )
        st.markdown(f"<div style='display:flex;gap:14px;flex-wrap:wrap'>{panels}</div>",
                    unsafe_allow_html=True)

        # Total general = portes + resto
        st.markdown(
            f"<div style='margin-top:10px;padding:10px 16px;background:#f0f4ff;border:1px solid #d1d9f8;"
            f"border-radius:8px;font-size:0.88rem;color:#3a47a8'>"
            f"<b>TOTAL FACTURA:</b> {s_total:,.2f} € "
            f"<span style='color:#6b7280'>= Portes {s_portes:,.2f} € + Resto {s_resto:,.2f} €</span></div>",
            unsafe_allow_html=True)

        if es_dhl:
            st.caption(
                "ℹ️ **'Otros' en DHL = recargo de combustible + contrareembolso.** Aplico el **% oficial "
                "de DHL del mes** de cada envío (doméstico/internacional) sobre *Portes + Reexpedición*. "
                "El resto es **contrareembolso** y, en envíos internacionales, el **suplemento "
                "internacional**. Si aparece una factura de un mes sin %, el sistema te lo pide para "
                "mantenerlo siempre correcto."
                + (f" ⚠️ % **asumido** (= mes anterior) para: {', '.join(meses_asumidos)}."
                   if meses_asumidos else "")
            )
        else:
            st.caption(
                "ℹ️ **Seguro** y **reexpedición** vienen en columnas propias; **Otros** agrupa el resto "
                "de suplementos de la agencia."
            )

        st.markdown("<div style='height:12px'></div>", unsafe_allow_html=True)

        # Mapa provincia→zona de la tarifa seleccionada (para explicar "sin tarifa")
        pz_sel = {}
        if es_dhl:
            import json as _json
            from services.geo_es import zonas_candidatas
            if tar_sel_id == "ALL":
                _cands = db.query(Tarifa).filter(Tarifa.agencia == agencia_sel).all()
            else:
                _cands = db.query(Tarifa).filter(Tarifa.tarifa_id == tar_sel_id).all()
            for _t in _cands:
                if _t and _t.reglas_json:
                    try:
                        _pz = _json.loads(_t.reglas_json).get("provincia_zona")
                        if _pz:
                            pz_sel = _pz
                            break
                    except Exception:
                        pass

        def _motivo_sin_tarifa(l):
            if not l.bultos:
                return "sin bultos en la línea"
            _, m = zonas_candidatas(l.destino, pz_sel)
            return m

        # ── Filtro por estado ─────────────────────────────────────────────────
        filtro = st.radio(
            "Mostrar",
            ["Todos", "✅ Conformes", "🔴 Cobrado de más", "🟡 Cobrado de menos", "❓ Sin tarifa"],
            horizontal=True, key="aud_filtro", label_visibility="collapsed",
        )

        # ── Tabla ─────────────────────────────────────────────────────────────
        MAP_FILTRO = {
            "✅ Conformes":       "TARIFA_OK",
            "🔴 Cobrado de más":  "DIFERENCIA_CONTRA",
            "🟡 Cobrado de menos": "DIFERENCIA_FAVOR",
            "❓ Sin tarifa":      "SIN_TARIFA",
        }
        estado_filtro = MAP_FILTRO.get(filtro)

        # Una columna de concepto solo aparece si tiene algún valor
        hay_comb   = any(x.combustible for x in lineas)
        hay_seguro = any(x.seguro for x in lineas)
        hay_reexp  = any(x.reexpedicion for x in lineas)

        rows = []
        lineas_filtradas = []
        for l in lineas:
            est = l.estado_tarifa or "SIN_TARIFA"
            if estado_filtro and est != estado_filtro:
                continue
            lineas_filtradas.append(l)
            imp_fac = l.total_facturado or 0
            imp_tar = l.importe_tarifa
            dif     = l.diferencia_importe
            pct     = l.porcentaje_diferencia
            fila = {
                "":               ESTADO_ICON.get(est, ""),
                "Expedición":     l.expedicion_agencia or "—",
                "Albarán Doccia": l.albaran_doccia or "—",
                "Fecha":          l.fecha_envio or "—",
                "Destinatario":   l.destinatario or "—",
                "Destino":        l.destino or "—",
                "Bultos":         l.bultos,
                "Kg":             l.kilos,
                # ── Conceptos facturados ──
                "Portes €":       round(l.portes or 0, 2),
            }
            # Conceptos facturados (cada columna solo si tiene algún valor)
            if hay_comb:
                fila["RC/Comb. €"] = round(l.combustible or 0, 2)
            if hay_seguro:
                fila["Seguro €"] = round(l.seguro or 0, 2)
            if hay_reexp:
                fila["Reexped. €"] = round(l.reexpedicion or 0, 2)
            fila["Otros €"] = round(l.otros or 0, 2)
            # Desglose de "Otros" en DHL: combustible (% oficial) + contrareembolso/resto
            if es_dhl and l.id in fuel_linea:
                comb_e, resto_e = fuel_linea[l.id]
                fila["· Combust. €"] = comb_e
                fila["· Contrareemb./resto €"] = resto_e
            fila.update({
                "Total factura €": round(imp_fac, 2),
                # ── Cruce con tarifa (sobre portes) ──
                "Tarifa portes €": round(imp_tar, 2) if imp_tar is not None else None,
                "Dif. portes €":   round(dif, 2)     if dif is not None     else None,
                "% Dif":           f"{pct:+.1f}%"    if pct is not None     else "—",
            })
            if es_dhl:
                fila["Motivo (sin tarifa)"] = _motivo_sin_tarifa(l) if est == "SIN_TARIFA" else ""
            fila["_estado"] = est
            rows.append(fila)

        if not rows:
            st.info("No hay líneas con ese estado.")
        else:
            df = pd.DataFrame(rows)

            # Cabeceras cortas para que entren todas las columnas
            SHORT = {
                "Albarán Doccia": "Albarán", "Destinatario": "Destinat.",
                "Portes €": "Portes", "RC/Comb. €": "RC", "Seguro €": "Seguro",
                "Reexped. €": "Reexp.", "Otros €": "Otros",
                "· Combust. €": "Comb.", "· Contrareemb./resto €": "Contrar.",
                "Total factura €": "Total", "Tarifa portes €": "Tarifa",
                "Dif. portes €": "Dif.", "Motivo (sin tarifa)": "Motivo",
            }
            df_show = df.drop(columns=["_estado"]).rename(columns=SHORT)

            def color_row(row):
                estado = df.at[row.name, "_estado"]
                color  = ESTADO_BG.get(estado, "")
                return [f"background-color:{color}"] * len(row) if color else [""] * len(row)

            def _e(v):   # importes en formato x,xx (None → —)
                if v is None or (isinstance(v, float) and pd.isna(v)):
                    return "—"
                return f"{v:,.2f}".replace(",", "§").replace(".", ",").replace("§", ".")

            def _i(v):   # enteros (bultos/kg) sin decimales
                if v is None or (isinstance(v, float) and pd.isna(v)):
                    return "—"
                return f"{int(round(v)):,}".replace(",", ".")

            eur_cols = ["Portes", "RC", "Seguro", "Reexp.", "Otros", "Comb.",
                        "Contrar.", "Total", "Tarifa", "Dif."]
            fmt = {c: _e for c in eur_cols if c in df_show.columns}
            for c in ("Bultos", "Kg"):
                if c in df_show.columns:
                    fmt[c] = _i

            styler = df_show.style.apply(color_row, axis=1).format(fmt)

            st.dataframe(
                styler,
                use_container_width=True,
                hide_index=True,
                height=min(600, 55 + len(rows) * 35),
            )

            # Totales del filtro activo (portes vs tarifa, mismo subconjunto)
            con_tar      = df[df["Tarifa portes €"].notna()]
            portes_sub   = con_tar["Portes €"].sum() if not con_tar.empty else 0
            tar_sub      = con_tar["Tarifa portes €"].sum() if not con_tar.empty else 0
            fac_total_sub = df["Total factura €"].sum()
            dsub_color   = "#16a34a" if (portes_sub - tar_sub) <= 0.01 else "#dc2626"

            st.markdown(
                f"<div style='display:flex;gap:28px;flex-wrap:wrap;padding:10px 16px;background:#f8f9fc;"
                f"border:1px solid #e8ebf3;border-radius:8px;font-size:0.85rem;margin-top:6px'>"
                f"<span><b>Portes facturados:</b> {portes_sub:,.2f} €</span>"
                f"<span><b>Portes según tarifa:</b> {tar_sub:,.2f} €</span>"
                f"<span style='color:{dsub_color}'><b>Diferencia portes:</b> {portes_sub - tar_sub:+,.2f} €</span>"
                f"<span style='color:#6b7280'>·</span>"
                f"<span><b>Total factura (todos conceptos):</b> {fac_total_sub:,.2f} €</span>"
                f"<span style='color:#6b7280'>{len(rows):,} albaranes</span>"
                f"</div>",
                unsafe_allow_html=True,
            )

            # Exportar (solo las filas visibles según el filtro activo)
            sufijo = estado_filtro.lower() if estado_filtro else "todos"
            fname  = f"auditoria_{factura_sel}_{sufijo}.xlsx"
            st.markdown("<div style='height:10px'></div>", unsafe_allow_html=True)
            col_exp, _ = st.columns([1, 4])
            with col_exp:
                clean = [{k: v for k, v in l.__dict__.items() if not k.startswith("_")}
                         for l in lineas_filtradas]
                path  = export_excel(clean, filename=fname)
                with open(path, "rb") as fh:
                    st.download_button(
                        f"📥 Exportar Excel ({len(lineas_filtradas):,} filas)",
                        fh.read(), file_name=fname,
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        use_container_width=True,
                    )
    finally:
        db.close()
