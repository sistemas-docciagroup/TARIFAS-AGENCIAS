import { openai } from "./openai.js";

// Palabras y patrones comunes en español para evitar llamadas a la API innecesarias
const PALABRAS_ES = /\b(el|la|los|las|un|una|de|en|que|es|se|del|al|lo|por|con|para|como|pero|su|sus|si|ya|así|también|hay|son|fue|está|tienen|puede|cuando|esto|aquí|tiene|nos|sin|sobre|han|hola|buenos|buenas|gracias|saludos|dias|tardes|noches)\b/i;

export async function detectarYTraducir(texto: string): Promise<{ idioma: string; traduccion: string | null }> {
  if (!texto || texto.trim().length < 15) return { idioma: "es", traduccion: null };

  // Heurística rápida: si tiene suficientes palabras españolas, no llamamos a la API
  const palabrasEs = (texto.match(PALABRAS_ES) || []).length;
  const palabrasTotales = texto.trim().split(/\s+/).length;
  if (palabrasEs / palabrasTotales > 0.15) return { idioma: "es", traduccion: null };

  if (!openai) return { idioma: "desconocido", traduccion: null };

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [{
        role: "system",
        content: `Detecta el idioma del texto y tradúcelo al español si no lo está.
Responde SOLO con JSON: {"idioma":"código ISO 639-1 (es/en/fr/pt/de/it/ca/eu/gl/...)","traduccion":"texto en español o null si ya está en español"}`,
      }, {
        role: "user",
        content: texto.slice(0, 2000),
      }],
    });
    const json = JSON.parse(res.choices[0].message.content ?? "{}") as { idioma?: string; traduccion?: string | null };
    const idioma = json.idioma ?? "desconocido";
    const traduccion = idioma === "es" ? null : (json.traduccion ?? null);
    return { idioma, traduccion };
  } catch {
    return { idioma: "desconocido", traduccion: null };
  }
}
