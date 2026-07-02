import sys
from pathlib import Path

# Project root must be in sys.path before any local imports
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dotenv import load_dotenv
load_dotenv(_ROOT / ".env", override=True)

import streamlit as st

st.set_page_config(
    page_title="Transportes Doccia Group",
    page_icon="🚛",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── DB init ───────────────────────────────────────────────────────────────────
try:
    from database.db import init_db
    init_db()
except Exception as _e:
    st.error(f"Error inicializando base de datos: {_e}")
    st.stop()

# ── Estilos ───────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
.stApp { background-color: #f8f9fc; }
[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #1a1f36 0%, #242944 100%);
    border-right: none;
}
[data-testid="stSidebar"] * { color: #c8cde8 !important; }
h1 { font-size:1.7rem !important; font-weight:700 !important; color:#1a1f36 !important; }
h2 { font-size:1.15rem !important; font-weight:600 !important; color:#2d3557 !important; }
[data-testid="stMetric"] {
    background:#fff; border:1px solid #e8ebf3; border-radius:12px;
    padding:16px 20px !important; box-shadow:0 1px 4px rgba(0,0,0,0.05);
}
[data-testid="stMetricLabel"] { font-size:0.75rem !important; font-weight:500 !important; color:#6b7280 !important; text-transform:uppercase; }
[data-testid="stMetricValue"] { font-size:1.5rem !important; font-weight:700 !important; color:#1a1f36 !important; }
.stButton > button[kind="primary"] {
    background: linear-gradient(135deg,#4f63d2,#6378f0) !important;
    border:none !important; border-radius:8px !important; font-weight:600 !important;
}
.stButton > button { border-radius:8px !important; font-weight:500 !important; border-color:#d1d5e8 !important; }
[data-testid="stExpander"] { border:1px solid #e8ebf3 !important; border-radius:10px !important; background:white !important; }
footer { visibility:hidden; }
#MainMenu { visibility:hidden; }
</style>
""", unsafe_allow_html=True)

# ── Sidebar / navegación ──────────────────────────────────────────────────────
PAGES = {
    "📤  Carga de facturas": "carga",
    "📋  Resultados": "resultados",
    "🔍  Auditoría": "auditoria",
    "💰  Tarifas": "tarifas",
    "📊  Comparador de tarifas": "comparador",
    "⚙️  Reglas de proceso": "reglas",
    "🧮  Simulador": "simulador",
    "📈  Dashboard": "dashboard",
}

with st.sidebar:
    st.markdown("""
    <div style="padding:8px 4px 20px 4px;">
        <div style="font-size:1.3rem; font-weight:700; color:#fff;">🚛 Transportes</div>
        <div style="font-size:0.85rem; color:#8890b8; margin-top:2px;">Doccia Group</div>
    </div>
    """, unsafe_allow_html=True)
    selected = st.radio("nav", list(PAGES.keys()), label_visibility="collapsed")

page = PAGES[selected]

# ── Cargar y ejecutar la vista ────────────────────────────────────────────────
try:
    if page == "carga":
        from views.carga import render
    elif page == "resultados":
        from views.resultados import render
    elif page == "auditoria":
        from views.auditoria import render
    elif page == "tarifas":
        from views.tarifas import render
    elif page == "comparador":
        from views.comparador import render
    elif page == "reglas":
        from views.reglas import render
    elif page == "simulador":
        from views.simulador import render
    elif page == "dashboard":
        from views.dashboard import render
    render()
except Exception as _e:
    import traceback
    st.error(f"Error en la página '{selected}':")
    st.code(traceback.format_exc())
