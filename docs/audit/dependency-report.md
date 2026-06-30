# Dependency Report

The Python app has three unused packages in `requirements.txt`. All other declared packages are actively used. The TypeScript app (`src/`) has its own `package.json` with a separate dependency set; those are not audited here as that codebase is a separate product.

---

## Python (`requirements.txt`)

| Package | Declared version | Status | Notes |
|---|---|---|---|
| `streamlit` | `>=1.35.0` | ✅ Used | Entry point of the app |
| `sqlalchemy` | `>=2.0.0` | ✅ Used | `database/db.py`, `database/models.py` |
| `pdfplumber` | `>=0.11.0` | ✅ Used | All PDF parsers |
| `PyMuPDF` | `>=1.24.0` | ✅ Used | `services/ai_verifier.py` (as `fitz`) |
| `pandas` | `>=2.2.0` | ✅ Used | Excel parsers, exporter |
| `openpyxl` | `>=3.1.0` | ✅ Used | `exports/exporter.py`, `views/carga.py`, `parsers/tdn.py` |
| `pytesseract` | `>=0.3.10` | ❌ **Not used** | No import found anywhere |
| `Pillow` | `>=10.0.0` | ❌ **Not used** | No `PIL` import found; PDF images use `fitz` |
| `plotly` | `>=5.22.0` | ✅ Used | `views/dashboard.py` |
| `python-dotenv` | `>=1.0.0` | ✅ Used | `services/ai_verifier.py` |
| `anthropic` | `>=0.112.0` | ❌ **Not used** | No import found; AI uses `openai` SDK instead |

**Note:** `openai` is used in `services/ai_verifier.py` (GPT-4o Vision) but is **not declared** in `requirements.txt`. It is presumably installed globally or via the Node.js app's `package.json`. This is a gap — if someone installs only from `requirements.txt`, the AI verifier will fail at runtime with `ModuleNotFoundError`.

---

## Undeclared import

**File:** `services/ai_verifier.py:45`

```python
import openai
```

`openai` is not in `requirements.txt`. It should be added (`openai>=1.0.0` or pinned to the version in use).
