import json
import pandas as pd
import streamlit as st
from pathlib import Path
import fitz  # PyMuPDF

from database.db import SessionLocal
from database.models import Tarifa, EstadoTarifa
from services.file_storage import save_tariff_file

AGENCIAS = ["DHL Parcel", "DHL Freight", "Molartrans", "DSV", "CEVA", "TDN", "FF Vale"]


def _excel_engine(suffix: str) -> str:
    """Motor de pandas según la extensión de Excel."""
    suffix = suffix.lower().lstrip(".")
    if suffix == "xlsb":
        return "pyxlsb"        # libros binarios
    if suffix == "xls":
        return "xlrd"          # formato antiguo
    return "openpyxl"          # xlsx y xlsm (con macros)


def _excel_cols(n: int) -> list[str]:
    """Etiquetas tipo Excel: A, B, …, Z, AA, AB…"""
    from openpyxl.utils import get_column_letter
    return [get_column_letter(i + 1) for i in range(n)]


def _extract_reglas(path: Path, agencia: str) -> tuple[str | None, str]:
    """Extrae reglas_json del archivo de tarifa. Devuelve (json|None, nota corta)."""
    suf = path.suffix.lower()
    if suf in {".xlsx", ".xlsm", ".xlsb", ".xls", ".csv"}:
        # DHL Parcel: intentar estructura bultos×zona (mamparas)
        if agencia == "DHL Parcel" and suf != ".csv":
            try:
                from parsers.dhl_tarifa import parse_dhl_tariff
                reglas = parse_dhl_tariff(path)
                if reglas:
                    return (json.dumps(reglas, ensure_ascii=False),
                            f"DHL bultos×zona ✓ ({len(reglas['tramos_bultos'])} tramos, "
                            f"{len(reglas['provincia_zona'])} provincias)")
            except Exception:
                pass
        try:
            df_reg = (pd.read_csv(path, dtype=str) if suf == ".csv"
                      else pd.read_excel(path, dtype=str, engine=_excel_engine(suf.lstrip("."))))
            return (json.dumps({"rows": df_reg.fillna("").to_dict(orient="records")},
                               ensure_ascii=False),
                    f"{len(df_reg)} filas (referencia)")
        except Exception as e:
            return None, f"sin reglas ({e})"
    if suf == ".pdf" and agencia == "Molartrans":
        try:
            from parsers.molartrans_tarifa import parse_tariff_pdf
            reglas = parse_tariff_pdf(path)
            if reglas:
                return json.dumps(reglas, ensure_ascii=False), "reglas Molartrans ✓"
            return None, "PDF sin tabla reconocida"
        except Exception as e:
            return None, f"sin reglas ({e})"
    if suf == ".pdf" and agencia == "TDN":
        try:
            from parsers.tdn_tarifa import parse_tdn_tariff
            reglas = parse_tdn_tariff(path)
            if reglas:
                return json.dumps(reglas, ensure_ascii=False), "reglas TDN ✓ (peso×baremo)"
            return None, "PDF sin tabla TDN reconocida"
        except Exception as e:
            return None, f"sin reglas ({e})"
    return None, "referencia visual"


def _render_spreadsheet(ruta: Path, tarifa_id: int) -> None:
    """Muestra el contenido de un Excel/CSV dentro de la app, hoja por hoja."""
    suf = ruta.suffix.lower().lstrip(".")
    try:
        if suf == "csv":
            df = pd.read_csv(ruta, header=None, dtype=str)
            sheets = {"CSV": df}
        else:
            xl = pd.ExcelFile(ruta, engine=_excel_engine(suf))
            sheets = {
                sh: pd.read_excel(ruta, sheet_name=sh, header=None,
                                  dtype=str, engine=_excel_engine(suf))
                for sh in xl.sheet_names
            }
    except Exception as e:
        st.error(f"No se pudo leer el archivo para mostrarlo: {e}")
        return

    def _show(df):
        df = df.dropna(how="all").dropna(axis=1, how="all").fillna("")
        if df.empty:
            st.caption("(hoja vacía)")
            return
        df.columns = _excel_cols(df.shape[1])
        st.dataframe(df, use_container_width=True, hide_index=True,
                     height=min(560, 45 + len(df) * 30))

    names = list(sheets.keys())
    if len(names) == 1:
        _show(sheets[names[0]])
    else:
        for tab, name in zip(st.tabs(names), names):
            with tab:
                _show(sheets[name])

ESTADO_BADGE = {
    "activa":             ("🟢", "Activa"),
    "sustituida":         ("🟡", "Sustituida"),
    "historica":          ("⚪", "Histórica"),
    "pendiente_revision": ("🔴", "Pendiente revisión"),
}


def render():
    st.title("💰 Tarifas")
    tab1, tab2 = st.tabs(["📋 Tarifas cargadas", "📤 Subir nueva tarifa"])

    # ── TAB 1: LISTADO ───────────────────────────────────────────────────────
    with tab1:
        agencia_f = st.selectbox("Filtrar por agencia", ["Todas"] + AGENCIAS, key="tar_f_ag")
        db = SessionLocal()
        try:
            q = db.query(Tarifa)
            if agencia_f != "Todas":
                q = q.filter(Tarifa.agencia == agencia_f)
            tarifas = q.order_by(Tarifa.agencia, Tarifa.version.desc()).all()

            if not tarifas:
                st.info("No hay tarifas cargadas. Ve a '📤 Subir nueva tarifa'.")
            else:
                # ── Agrupadas por AGENCIA ────────────────────────────────────
                from collections import defaultdict
                por_agencia = defaultdict(list)
                for t in tarifas:
                    por_agencia[t.agencia].append(t)

                for agencia in sorted(por_agencia):
                    ts = sorted(por_agencia[agencia],
                                key=lambda x: ((x.tipologia or ""), -x.version))
                    n_estr = sum(1 for t in ts
                                 if t.reglas_json and '"tipo_tarifa"' in (t.reglas_json or ""))
                    st.markdown(
                        f"<div style='background:#1a1f36;color:#fff;border-radius:10px 10px 0 0;"
                        f"padding:10px 16px;margin-top:14px;font-weight:700;font-size:1.0rem'>"
                        f"🚚 {agencia}"
                        f"<span style='float:right;font-weight:400;font-size:0.8rem;color:#a9b0d6'>"
                        f"{len(ts)} tarifa(s) · {n_estr} con cálculo automático</span></div>",
                        unsafe_allow_html=True,
                    )
                    # Chips con las tipologías de la agencia
                    tips = " ".join(
                        f"<span style='display:inline-block;background:#eef1ff;color:#4f63d2;"
                        f"border:1px solid #c7d0f7;border-radius:999px;padding:1px 9px;margin:2px 3px;"
                        f"font-size:0.72rem'>{t.tipologia or '(sin tipología)'}</span>"
                        for t in ts
                    )
                    st.markdown(
                        f"<div style='border:1px solid #e8ebf3;border-top:none;border-radius:0 0 10px 10px;"
                        f"padding:8px 14px;margin-bottom:6px'>{tips}</div>",
                        unsafe_allow_html=True,
                    )
                    for t in ts:
                        _render_tarifa(t, db)
        finally:
            db.close()

    # ── TAB 2: SUBIR TARIFA ──────────────────────────────────────────────────
    with tab2:
        if "tar_upload_key" not in st.session_state:
            st.session_state["tar_upload_key"] = 0
        if st.session_state.get("tar_guardada"):
            st.success(st.session_state.pop("tar_guardada"))

        uk = st.session_state["tar_upload_key"]
        uploaded_files = st.file_uploader(
            "Archivos de tarifa (Excel, CSV o PDF) — puedes seleccionar varios a la vez",
            type=["xlsx", "xlsm", "xlsb", "xls", "csv", "pdf"],
            accept_multiple_files=True,
            key=f"tar_file_{uk}",
        )

        if uploaded_files:
            st.caption(f"📦 {len(uploaded_files)} archivo(s) seleccionado(s)")

        st.markdown("---")
        with st.form("upload_tariff_form"):
            agencia = st.selectbox("Agencia *  (común a todos los archivos)", AGENCIAS)

            tip_inputs: dict[str, str] = {}
            if uploaded_files:
                st.markdown("**Tipología / cabecera de cada archivo** "
                            "_(se rellena con el nombre; edítala si quieres)_")
                for f in uploaded_files:
                    stem = f.name.rsplit(".", 1)[0].strip()
                    tip_inputs[f.name] = st.text_input(
                        f"📄 {f.name}", value=stem, key=f"tip_{uk}_{f.name}",
                    )

            col_d1, col_d2 = st.columns(2)
            with col_d1:
                fecha_inicio = st.date_input("Vigencia desde *  (común)")
            with col_d2:
                fecha_fin_val = st.date_input("Vigencia hasta (opcional, común)", value=None)
            notas = st.text_input("Notas (opcional, común)")

            n_sel = len(uploaded_files) if uploaded_files else 0
            submitted = st.form_submit_button(
                f"💾 Guardar {n_sel} tarifa(s)", type="primary", use_container_width=True)

        if submitted:
            if not uploaded_files:
                st.error("Selecciona al menos un archivo antes de guardar.")
            elif any(not (tip_inputs.get(f.name) or "").strip() for f in uploaded_files):
                st.error("Cada archivo necesita su tipología / cabecera.")
            else:
                db = SessionLocal()
                bar = st.progress(0, text="Guardando…")
                resultados, errores = [], []
                try:
                    total = len(uploaded_files)
                    for i, f in enumerate(uploaded_files):
                        bar.progress(int(i / total * 100), text=f"Guardando {f.name}…")
                        tip = tip_inputs[f.name].strip()
                        path = save_tariff_file(f.name, f.getvalue())

                        last = db.query(Tarifa).filter(
                            Tarifa.agencia == agencia, Tarifa.tipologia == tip,
                        ).order_by(Tarifa.version.desc()).first()
                        new_version = (last.version + 1) if last else 1
                        if last and last.estado == EstadoTarifa.ACTIVA:
                            last.estado = EstadoTarifa.SUSTITUIDA

                        reglas_json, nota = _extract_reglas(path, agencia)
                        db.add(Tarifa(
                            agencia=agencia, tipologia=tip,
                            fecha_inicio=str(fecha_inicio),
                            fecha_fin=str(fecha_fin_val) if fecha_fin_val else None,
                            version=new_version, archivo_nombre=f.name,
                            ruta_archivo=str(path), reglas_json=reglas_json,
                            estado=EstadoTarifa.ACTIVA, notas=notas or None,
                        ))
                        ver_txt = f"v{new_version}" + (" (sustituye anterior)" if last else "")
                        resultados.append(f"{tip} {ver_txt} · {nota}")
                    db.commit()
                    bar.progress(100, text="¡Listo!")
                    bar.empty()
                    st.session_state["tar_guardada"] = (
                        f"✅ {len(resultados)} tarifa(s) de {agencia} guardada(s):\n\n- "
                        + "\n- ".join(resultados)
                    )
                    st.session_state["tar_upload_key"] += 1
                    st.rerun()
                except Exception as e:
                    bar.empty()
                    db.rollback()
                    st.error(f"Error al guardar: {e}")
                finally:
                    db.close()


def _render_tarifa(t, db):
    """Renderiza una tarifa (cabecera + visor + borrado) dentro del listado por agencia."""
    estado_str = t.estado.value if hasattr(t.estado, "value") else str(t.estado)
    icono, etiqueta = ESTADO_BADGE.get(estado_str, ("⚪", estado_str))
    vigencia = f"{t.fecha_inicio} → {t.fecha_fin or 'indefinida'}"
    label = f"{icono}  {t.tipologia or t.agencia}  ·  {etiqueta}  ·  v{t.version}  ·  {vigencia}"

    with st.expander(label):
        ruta = Path(t.ruta_archivo) if t.ruta_archivo else None
        if ruta and ruta.exists():
            if ruta.suffix.lower() == ".pdf":
                try:
                    doc = fitz.open(str(ruta))
                    n = len(doc)
                    bar = st.progress(0, text=f"Cargando página 1 de {n}…")
                    for pn in range(n):
                        bar.progress((pn + 1) / n, text=f"Cargando página {pn+1} de {n}…")
                        page = doc.load_page(pn)
                        pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8))
                        st.image(pix.tobytes("png"), use_container_width=True)
                    bar.empty()
                    doc.close()
                except Exception as e:
                    st.error(f"Error abriendo PDF: {e}")
            else:
                _render_spreadsheet(ruta, t.tarifa_id)
                with open(ruta, "rb") as fh:
                    st.download_button(
                        f"📥 Descargar {t.archivo_nombre}",
                        fh.read(),
                        file_name=t.archivo_nombre or ruta.name,
                        key=f"dl_{t.tarifa_id}",
                    )
        elif t.ruta_archivo:
            st.warning(f"Archivo no encontrado: `{t.ruta_archivo}`")

        if t.notas:
            st.caption(f"Notas: {t.notas}")

        st.markdown("---")
        if st.checkbox("Borrar esta tarifa", key=f"chk_del_{t.tarifa_id}"):
            if st.button("🗑️ Confirmar borrado", type="primary", key=f"btn_del_{t.tarifa_id}"):
                db.query(Tarifa).filter(Tarifa.tarifa_id == t.tarifa_id).delete()
                db.commit()
                st.success("Tarifa borrada.")
                st.rerun()
