# Dead Code

Three packages declared in `requirements.txt` are never imported anywhere in the Python source. One configuration file is permanently broken. No commented-out code blocks longer than 5 lines were found in the Python codebase.

---

## Finding 1 — `pytesseract` imported nowhere

**File:** `requirements.txt:7`

`pytesseract>=0.3.10` appears in the manifest but the string `pytesseract` does not appear in any `.py` file in the project. The package is not used.

## Finding 2 — `Pillow` imported nowhere

**File:** `requirements.txt:8`

`Pillow>=10.0.0` (`import PIL`) appears in the manifest but is never imported. The PDF-to-image conversion in `services/ai_verifier.py` uses PyMuPDF (`fitz`) directly, not Pillow.

## Finding 3 — `anthropic` imported nowhere

**File:** `requirements.txt:11`

`anthropic>=0.112.0` appears in the manifest but the string `anthropic` does not appear in any `.py` file. The AI verification in `services/ai_verifier.py` uses `openai`, not the Anthropic SDK. This may be a leftover from an earlier design where the Anthropic API was considered.

## Finding 4 — `ecosystem.config.cjs` is permanently broken

**File:** `ecosystem.config.cjs:7`

```js
cwd: "C:/Users/alfonsop/Documents/doccia-ai",
```

This PM2 process-manager config points to a path that does not exist on any machine except `alfonsop`'s. It cannot start the app on any other machine and provides no value in the repository as-is. It is effectively dead configuration.

## Finding 5 — `_fetch_from_sap` is a stub that returns `None`

**File:** `services/sap_client.py:34–36`

```python
def _fetch_from_sap(albaran: str, agencia: str) -> dict | None:
    """TODO: implementar la llamada real a SAP (RFC/OData/servicio web)."""
    return None
```

This function is called only when `SAP_CONECTADO = True` (line 21), which is currently `False`. The function body is a stub and the call path is unreachable. It is not dead in the delete-it sense — it marks where real SAP integration will go — but it should be tracked as a pending implementation.
