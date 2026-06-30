"""
Verificación IA: compara posición a posición los datos extraídos con el PDF
usando GPT-4o Vision para explicar el origen de cualquier desviación.
"""
import base64
import json
from pathlib import Path


def _pdf_images(pdf_path: Path, indices: list[int]) -> list[dict]:
    import fitz
    doc  = fitz.open(str(pdf_path))
    mat  = fitz.Matrix(2.0, 2.0)
    imgs = []
    for i in indices:
        if 0 <= i < len(doc):
            pix = doc[i].get_pixmap(matrix=mat)
            b64 = base64.standard_b64encode(pix.tobytes("png")).decode()
            imgs.append({"page": i + 1, "total": len(doc), "b64": b64})
    doc.close()
    return imgs


def _rows_table(rows: list[dict]) -> str:
    lines = ["Nº  | Albarán agencia  | Portes €  | Seguro €  | Otros €   | TOTAL LÍNEA €"]
    lines.append("-" * 72)
    for i, r in enumerate(rows, 1):
        lines.append(
            f"{i:4d} | {str(r.get('expedicion_agencia') or '—'):16s} | "
            f"{r.get('portes') or 0:9.2f} | "
            f"{r.get('seguro') or 0:9.2f} | "
            f"{(r.get('combustible') or 0) + (r.get('otros') or 0):9.2f} | "
            f"{r.get('total_facturado') or 0:13.2f}"
        )
    total = sum(r.get("total_facturado") or 0 for r in rows)
    lines.append("-" * 72)
    lines.append(f"{'SUMA EXTRAÍDA':>55} | {total:13.2f}")
    return "\n".join(lines)


def verify_invoice(pdf_path: Path, extracted_rows: list[dict], agency: str) -> dict:
    """
    Verifica posición a posición la extracción contra el PDF usando GPT-4o Vision.
    """
    import openai
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    n_ext      = len(extracted_rows)
    total_ext  = sum(r.get("total_facturado") or 0 for r in extracted_rows)
    portes_ext = sum(r.get("portes") or 0 for r in extracted_rows)
    seguro_ext = sum(r.get("seguro") or 0 for r in extracted_rows)
    comb_ext   = sum(r.get("combustible") or 0 for r in extracted_rows)
    otros_ext  = sum(r.get("otros") or 0 for r in extracted_rows)
    fac_ext    = extracted_rows[0].get("factura", "") if extracted_rows else ""

    # ── Páginas a revisar ────────────────────────────────────────────────────
    try:
        import fitz
        doc = fitz.open(str(pdf_path))
        total_pages = len(doc)
        doc.close()
    except Exception as e:
        return {"error": f"No se pudo abrir el PDF: {e}"}

    # Primera página + últimas 3 (donde suelen estar los resúmenes y totales)
    page_indices = [0]
    for i in range(min(3, total_pages - 1), 0, -1):
        page_indices.append(total_pages - i)
    page_indices = sorted(set(page_indices))[:5]

    try:
        images = _pdf_images(pdf_path, page_indices)
    except Exception as e:
        return {"error": f"Error convirtiendo PDF a imagen: {e}"}

    # ── Tabla de posiciones para el prompt ───────────────────────────────────
    sample    = extracted_rows
    truncated = False
    if n_ext > 80:
        sample    = extracted_rows[:50] + extracted_rows[-20:]
        truncated = True

    tabla = _rows_table(sample)
    nota  = (
        f"\n(Tabla truncada: mostrando 70 de {n_ext} líneas. "
        f"Suma real de {n_ext} líneas: {total_ext:,.2f} €)"
        if truncated else ""
    )

    # ── Mensaje a GPT-4o ─────────────────────────────────────────────────────
    content: list = []
    for img in images:
        content.append({
            "type": "text",
            "text": f"Página {img['page']} de {img['total']}:"
        })
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{img['b64']}",
                "detail": "high",
            },
        })

    content.append({
        "type": "text",
        "text": f"""Soy un sistema de gestión de transporte. He extraído automáticamente albaranes de esta factura de {agency} mediante expresiones regulares. Necesito que verifiques si la extracción es correcta comparando posición a posición.

IMPORTANTE: Los importes que extraigo son SIN IVA (importes netos de cada línea de transporte).
Por tanto la comparación correcta es: mi TOTAL EXTRAÍDO vs la BASE IMPONIBLE del PDF (NO vs el total con IVA).

DATOS EXTRAÍDOS POR MI SISTEMA:
• Número de factura detectado: {fac_ext or "NO DETECTADO"}
• Líneas extraídas: {n_ext}
• Suma de portes: {portes_ext:,.2f} €
• Suma de seguro: {seguro_ext:,.2f} €
• Suma de combustible: {comb_ext:,.2f} €
• Suma de otros: {otros_ext:,.2f} €
• TOTAL EXTRAÍDO (suma neta línea a línea, sin IVA): {total_ext:,.2f} €

DETALLE POSICIÓN A POSICIÓN:
{tabla}{nota}

TAREA — analiza el PDF y responde:
1. Localiza el número de factura en el PDF.
2. Localiza la BASE IMPONIBLE del PDF (importe antes de IVA) y el IVA por separado.
3. Compara mi TOTAL EXTRAÍDO ({total_ext:,.2f} €) contra la BASE IMPONIBLE del PDF.
4. Si hay desviación entre base imponible y total extraído, identifica la causa exacta:
   - ¿Hay conceptos en la base imponible (combustible, recargo, seguro, tasas...) que no estoy sumando?
   - ¿Hay líneas en el PDF que no aparecen en mi tabla extraída?
   - ¿Algún importe por línea difiere entre PDF y tabla?
5. Desglosa los subtotales del PDF por concepto si aparecen (portes, combustible, seguro, otros).

Responde SOLO con JSON (sin texto extra, sin markdown):
{{
  "numero_factura": "<número exacto del PDF>",
  "base_imponible_pdf": <base imponible del PDF sin IVA, como número decimal>,
  "iva_pdf": <importe del IVA del PDF, como número decimal>,
  "total_pdf_con_iva": <total final con IVA del PDF>,
  "total_extraido": {total_ext:.2f},
  "diferencia": <base_imponible_pdf - total_extraido>,
  "lineas_pdf": <número de albaranes/líneas en el PDF>,
  "lineas_extraidas": {n_ext},
  "coincide_numero": <true/false>,
  "coincide_base": <true si base_imponible_pdf ≈ total_extraido con tolerancia 0.10€>,
  "causas_desviacion": ["<causa 1 concreta y específica>", "<causa 2...>"],
  "desglose_pdf": {{
    "portes": <número o null>,
    "combustible": <número o null>,
    "seguro": <número o null>,
    "otros": <número o null>
  }},
  "recomendacion": "<acción concreta para corregir la extracción>",
  "confianza": "<alta|media|baja>"
}}"""
    })

    client = openai.OpenAI()
    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1200,
            messages=[{"role": "user", "content": content}],
        )
        raw = resp.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip().rstrip("`").strip()
        result = json.loads(raw)
        result["error"] = None
        return result
    except json.JSONDecodeError as e:
        return {"error": f"Respuesta IA no parseable: {e}", "raw": raw}
    except Exception as e:
        return {"error": str(e)}
