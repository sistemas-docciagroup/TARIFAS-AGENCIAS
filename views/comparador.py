import base64
import json
import tempfile
from pathlib import Path

import pandas as pd
import streamlit as st

from database.db import SessionLocal
from database.models import Tarifa


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pdf_pages_b64(path: Path, max_pages: int = 6) -> list[str]:
    import fitz
    doc = fitz.open(str(path))
    mat = fitz.Matrix(2.0, 2.0)
    out = []
    for i in range(min(max_pages, len(doc))):
        pix = doc[i].get_pixmap(matrix=mat)
        out.append(base64.standard_b64encode(pix.tobytes("png")).decode())
    doc.close()
    return out


def _excel_preview(path: Path) -> pd.DataFrame | None:
    suf = path.suffix.lower()
    try:
        if suf == ".csv":
            return pd.read_csv(path, dtype=str).head(40)
        eng = "pyxlsb" if suf == ".xlsb" else ("xlrd" if suf == ".xls" else "openpyxl")
        return pd.read_excel(path, dtype=str, engine=eng).head(40)
    except Exception:
        return None


def _content_from_file(path: Path, proveedor: str) -> list[dict]:
    suf = path.suffix.lower()
    content: list[dict] = []
    if suf == ".pdf":
        try:
            pages = _pdf_pages_b64(path)
            content.append({"type": "text",
                            "text": f"Tarifa recibida de {proveedor} (PDF, {len(pages)} páginas):"})
            for i, b64 in enumerate(pages):
                content.append({"type": "text", "text": f"Página {i+1}:"})
                content.append({"type": "image_url", "image_url": {
                    "url": f"data:image/png;base64,{b64}", "detail": "high"
                }})
        except Exception as e:
            content.append({"type": "text", "text": f"(Error leyendo PDF: {e})"})
    else:
        df = _excel_preview(path)
        if df is not None:
            content.append({"type": "text",
                            "text": f"Tarifa recibida de {proveedor} (Excel/CSV):\n{df.to_string(index=False)}"})
        else:
            content.append({"type": "text", "text": "(No se pudo leer el archivo)"})
    return content


def _tarifa_resumen(tarifa: Tarifa) -> str:
    if not tarifa or not tarifa.reglas_json:
        return "(sin reglas estructuradas)"
    try:
        r = json.loads(tarifa.reglas_json)
    except Exception:
        return "(reglas no parseables)"
    lines = [
        f"Agencia: {tarifa.agencia}  |  Tipología: {tarifa.tipologia or '—'}  |  v{tarifa.version}",
        f"Vigencia: {tarifa.fecha_inicio} → {tarifa.fecha_fin or '∞'}",
        f"Tipo de tarifa: {r.get('tipo_tarifa', 'desconocido')}",
    ]
    if "tramos" in r:
        lines.append("Tramos de peso:")
        tramos = r["tramos"]
        if isinstance(tramos, dict):
            for mat, ts in list(tramos.items())[:3]:
                for t in ts[:5]:
                    precio_str = "  ".join(f"E{k}:{v}€" for k, v in t.get("precios", {}).items())
                    lines.append(f"  {mat} hasta {t.get('hasta')}kg → {precio_str}")
        elif isinstance(tramos, list):
            for t in tramos[:6]:
                lines.append(f"  {t.get('desde', 0)}-{t.get('hasta', '?')}kg: {t.get('precio', '?')}€")
    if "tramos_bultos" in r:
        lines.append("Tramos bultos:")
        for t in r["tramos_bultos"][:5]:
            precio_str = "  ".join(f"Z{k}:{v}€" for k, v in list(t.get("precios", {}).items())[:5])
            lines.append(f"  {t.get('desde')}-{t.get('hasta')} bultos → {precio_str}")
    if "zonas" in r:
        lines.append("Zonas:")
        for zona, precios in list(r["zonas"].items())[:5]:
            lines.append(f"  {zona}: {precios}")
    return "\n".join(lines)


def _openai_client():
    import openai
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    return openai.OpenAI()


# ── Paso 1: entender la tarifa ────────────────────────────────────────────────

def _entender_tarifa(path: Path, proveedor: str, contexto: str) -> str:
    content = _content_from_file(path, proveedor)
    content.append({"type": "text", "text": f"""
Eres un experto en tarifas de transporte. Analiza este documento de tarifa recibido de "{proveedor}".
Contexto del análisis: {contexto or "comparativa de mercado / evaluación de proveedor"}.

Extrae y explica la estructura completa con:

1. **Tipo de tarifa** — ¿cómo se calcula el precio? (por bultos, por kg, por zona, por tramo, combinación…)
2. **Estructura de zonas** — qué zonas existen y cómo se asignan (por provincia, CP, región…)
3. **Tabla de precios completa** — reproduce todos los precios que ves, organizados por zona y tramo. Usa tablas markdown.
4. **Conceptos adicionales** — recargos, combustible, seguro, mínimos, penalizaciones, condiciones.
5. **Dudas o puntos ambiguos** — si algo no está claro o falta información, indícalo explícitamente.

Sé preciso con los números. Si hay una tabla en el documento, reprodúcela entera.
"""})
    resp = _openai_client().chat.completions.create(
        model="gpt-4o", max_tokens=2500,
        messages=[{"role": "user", "content": content}],
    )
    return resp.choices[0].message.content.strip()


# ── Paso 2: comparar con la tarifa de referencia ─────────────────────────────

def _comparar_tarifas(path: Path, proveedor: str, tar_ref: Tarifa,
                      entendida: str, contexto: str) -> str:
    content = _content_from_file(path, proveedor)
    resumen_ref = _tarifa_resumen(tar_ref) if tar_ref else "(sin tarifa de referencia)"
    agencia_ref = tar_ref.agencia if tar_ref else "la agencia actual"
    content.append({"type": "text", "text": f"""
ESTRUCTURA QUE YA HAS EXTRAÍDO DE LA TARIFA DE "{proveedor}":
{entendida}

TARIFA DE REFERENCIA EN SISTEMA ({agencia_ref}):
{resumen_ref}

Contexto: {contexto or "evaluación de proveedor / análisis de mercado"}.
Esta tarifa NO está aceptada ni va a registrarse en el sistema. El objetivo es decidir si interesa.

Haz la comparativa entre ambas tarifas con:

1. **Tabla comparativa de precios** — columnas: Zona/Tramo | {agencia_ref} (actual) | {proveedor} (nueva) | Dif. € | Dif. % | Mejor opción
2. **Diferencias estructurales** — zonas, tramos o métodos de cálculo que cambien.
3. **Escenarios concretos** — ¿en qué tipo de envíos sale más barata la nueva tarifa? ¿en cuáles sale cara?
4. **Letra pequeña y riesgos** — condiciones que pueden encarecer en la práctica aunque el precio base sea bajo.
5. **Argumentos para negociar** — qué puntos concretos conviene pedir que mejoren antes de decidir.
6. **Conclusión** — ¿interesa explorar este proveedor? ¿Para qué tipo de envíos sí y para cuáles no?
"""})
    resp = _openai_client().chat.completions.create(
        model="gpt-4o", max_tokens=2500,
        messages=[{"role": "user", "content": content}],
    )
    return resp.choices[0].message.content.strip()


# ── Vista principal ───────────────────────────────────────────────────────────

def render():
    st.title("📊 Comparador de tarifas")
    st.caption(
        "Analiza tarifas que recibes del mercado — nuevos proveedores, renovaciones, benchmarking. "
        "Las tarifas que subas aquí son solo para análisis y **no se guardan en el sistema**."
    )

    db = SessionLocal()
    try:
        # ── Proveedor + contexto ──────────────────────────────────────────────
        col_prov, col_ctx = st.columns([1, 2])
        with col_prov:
            st.caption("Proveedor / transportista")
            proveedor = st.text_input("Proveedor", placeholder="Ej: Seur, XPO, nuevo proveedor…",
                                      label_visibility="collapsed", key="cmp_proveedor")
        with col_ctx:
            st.caption("Contexto del análisis (opcional)")
            contexto = st.text_input("Contexto", label_visibility="collapsed", key="cmp_contexto",
                                     placeholder="Ej: renovación contrato, comparativa mercado, evaluar servicio Canarias…")

        if not proveedor:
            st.info("Indica el nombre del proveedor para continuar.")
            return

        # ── Tarifa de referencia (cualquier agencia del sistema) ──────────────
        st.caption("Tarifa de referencia (con la que comparar)")
        tarifas_todas = db.query(Tarifa).order_by(Tarifa.agencia, Tarifa.version.desc()).all()

        tar_ref = None
        if not tarifas_todas:
            st.warning("No hay tarifas en el sistema. La IA analizará la nueva tarifa sin comparativa.")
        else:
            opts = {"— Sin comparativa (solo entender la tarifa) —": None}
            opts.update({
                f"{t.agencia}  ·  v{t.version}  ·  {t.tipologia or '(sin tipología)'}  ·  "
                f"{t.fecha_inicio} → {t.fecha_fin or '∞'}": t
                for t in tarifas_todas
            })
            sel = st.selectbox("Referencia", list(opts.keys()),
                               label_visibility="collapsed", key="cmp_ref")
            tar_ref = opts[sel]

        st.markdown("---")

        # ── Subida ───────────────────────────────────────────────────────────
        archivo = st.file_uploader(
            "Sube la tarifa recibida (PDF, Excel o CSV)",
            type=["pdf", "xlsx", "xlsm", "xlsb", "xls", "csv"],
            key="cmp_upload",
        )
        if not archivo:
            st.info("Sube el archivo para continuar.")
            return

        suf = Path(archivo.name).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suf) as tmp:
            tmp.write(archivo.read())
            nueva_path = Path(tmp.name)

        file_key = f"{proveedor}_{archivo.name}_{archivo.size}"

        # ── Preview ──────────────────────────────────────────────────────────
        with st.expander("👁 Vista previa", expanded=True):
            if suf.lower() == ".pdf":
                try:
                    for i, b64 in enumerate(_pdf_pages_b64(nueva_path, 3)):
                        st.image(f"data:image/png;base64,{b64}",
                                 caption=f"Página {i+1}", use_container_width=True)
                except Exception as e:
                    st.error(f"Error mostrando PDF: {e}")
            else:
                df_prev = _excel_preview(nueva_path)
                if df_prev is not None:
                    st.dataframe(df_prev, use_container_width=True, hide_index=True)

        if tar_ref:
            with st.expander(f"📋 Tarifa de referencia: {tar_ref.agencia}", expanded=False):
                st.code(_tarifa_resumen(tar_ref), language=None)

        st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)

        # ── Dos botones ───────────────────────────────────────────────────────
        key_entender = f"cmp_entendida_{file_key}"
        key_comparar = f"cmp_comparada_{file_key}_{tar_ref.tarifa_id if tar_ref else 'none'}"
        entendida_ok = bool(st.session_state.get(key_entender))

        col1, col2, col3 = st.columns([1, 1, 2])
        with col1:
            do_entender = st.button("🧠 Entender tarifa", type="primary",
                                    use_container_width=True, key="btn_entender")
        with col2:
            do_comparar = st.button(
                "⚖️ Comparar con referencia", type="secondary",
                use_container_width=True, key="btn_comparar",
                disabled=not entendida_ok or tar_ref is None,
                help=(
                    "Primero pulsa 'Entender tarifa' y verifica que la IA la ha leído bien."
                    if not entendida_ok else
                    "Selecciona una tarifa de referencia para comparar." if not tar_ref else ""
                ),
            )
        with col3:
            if not entendida_ok:
                st.caption("⬅ Pulsa **Entender tarifa** y verifica que la IA la ha leído correctamente.")
            elif not tar_ref:
                st.caption("⬅ Selecciona una tarifa de referencia para activar la comparativa.")
            else:
                st.caption(f"✅ Listo para comparar contra **{tar_ref.agencia} v{tar_ref.version}**.")

        # ── Paso 1 ────────────────────────────────────────────────────────────
        if do_entender:
            with st.spinner("Leyendo y entendiendo la tarifa…"):
                try:
                    st.session_state[key_entender] = _entender_tarifa(nueva_path, proveedor, contexto)
                    st.session_state.pop(key_comparar, None)
                except Exception as e:
                    st.error(f"Error: {e}")

        if st.session_state.get(key_entender):
            st.markdown("---")
            st.subheader("🧠 Lo que la IA ha entendido de esta tarifa")
            st.markdown(st.session_state[key_entender])
            if tar_ref:
                st.info("¿Lo ha entendido bien? Entonces pulsa **⚖️ Comparar con referencia**.")

        # ── Paso 2 ────────────────────────────────────────────────────────────
        if do_comparar and st.session_state.get(key_entender) and tar_ref:
            with st.spinner("Comparando…"):
                try:
                    st.session_state[key_comparar] = _comparar_tarifas(
                        nueva_path, proveedor, tar_ref,
                        st.session_state[key_entender], contexto
                    )
                except Exception as e:
                    st.error(f"Error: {e}")

        if st.session_state.get(key_comparar):
            st.markdown("---")
            st.subheader(f"⚖️ {proveedor} vs {tar_ref.agencia}")
            st.markdown(st.session_state[key_comparar])

    finally:
        db.close()
