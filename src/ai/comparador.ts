import { openai } from "./openai.js";
import { config } from "../config.js";

export interface ResultadoComparacion {
  similarityScore: number; // 0..1 (determinista)
  diffSummary: string;
  detectedChanges: string[];
  learningSummary: string;
}

/** Tokeniza a palabras normalizadas (sin acentos ni signos). */
function tokens(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Similitud determinista (coeficiente de Dice sobre conjuntos de palabras). */
export function similitud(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

/** Palabras presentes en `b` que no estaban en `a` (aprox. "anadido por humano"). */
function diffPalabras(a: string, b: string): { anadidas: string[]; eliminadas: string[] } {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  const anadidas = [...sb].filter((w) => !sa.has(w) && w.length > 3);
  const eliminadas = [...sa].filter((w) => !sb.has(w) && w.length > 3);
  return { anadidas, eliminadas };
}

const schema = {
  name: "analisis_correccion",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      diffSummary: { type: "string", description: "Resumen breve de que cambio el humano respecto a la IA." },
      detectedChanges: {
        type: "array",
        items: { type: "string" },
        description:
          "Lista de cambios concretos: datos nuevos solicitados, compromisos eliminados, condiciones comerciales modificadas, correcciones tecnicas, cambios de tono.",
      },
      learningSummary: {
        type: "string",
        description: "Una regla de aprendizaje accionable y generalizable, en una frase.",
      },
    },
    required: ["diffSummary", "detectedChanges", "learningSummary"],
  },
} as const;

/**
 * Compara la propuesta de la IA con el texto final humano.
 * - similarityScore: siempre determinista (para los umbrales de clasificacion).
 * - diffSummary / detectedChanges / learningSummary: con GPT-5.5 si hay clave;
 *   si no, un analisis basico por diferencia de palabras.
 */
export async function compararTextos(
  textoIa: string,
  textoHumano: string,
): Promise<ResultadoComparacion> {
  const similarityScore = Number(similitud(textoIa, textoHumano).toFixed(3));

  if (!openai) {
    const { anadidas, eliminadas } = diffPalabras(textoIa, textoHumano);
    return {
      similarityScore,
      diffSummary:
        `(demo) Similitud ${(similarityScore * 100).toFixed(0)}%. ` +
        `Anadido: ${anadidas.slice(0, 8).join(", ") || "—"}. ` +
        `Eliminado: ${eliminadas.slice(0, 8).join(", ") || "—"}.`,
      detectedChanges: [
        anadidas.length ? `Datos/terminos anadidos: ${anadidas.slice(0, 8).join(", ")}` : "",
        eliminadas.length ? `Terminos eliminados: ${eliminadas.slice(0, 8).join(", ")}` : "",
      ].filter(Boolean),
      learningSummary: "(demo offline) Configura OPENAI_API_KEY para aprendizaje detallado.",
    };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: config.openai.modeloGenerador,
      messages: [
        {
          role: "system",
          content:
            "Eres un analista de calidad de atencion al cliente de Doccia Group. " +
            "Comparas la respuesta PROPUESTA por la IA con la respuesta FINAL enviada por un agente humano " +
            "y extraes que se aprende de la correccion. Se conciso y accionable. Responde en espanol.",
        },
        {
          role: "user",
          content:
            `RESPUESTA IA:\n${textoIa}\n\n` +
            `RESPUESTA FINAL HUMANA:\n${textoHumano}\n\n` +
            `Analiza las diferencias: datos nuevos solicitados, compromisos eliminados, ` +
            `condiciones comerciales modificadas, correcciones tecnicas y cambios de tono. ` +
            `Devuelve el JSON pedido.`,
        },
      ],
      response_format: { type: "json_schema", json_schema: schema },
    });
    const data = JSON.parse(resp.choices[0]?.message?.content ?? "{}") as Omit<
      ResultadoComparacion,
      "similarityScore"
    >;
    return { similarityScore, ...data };
  } catch (err) {
    console.warn("[comparador] Fallo OpenAI, uso analisis basico:", err instanceof Error ? err.message : err);
    const { anadidas, eliminadas } = diffPalabras(textoIa, textoHumano);
    return {
      similarityScore,
      diffSummary: `Similitud ${(similarityScore * 100).toFixed(0)}%.`,
      detectedChanges: [
        anadidas.length ? `Anadido: ${anadidas.slice(0, 8).join(", ")}` : "",
        eliminadas.length ? `Eliminado: ${eliminadas.slice(0, 8).join(", ")}` : "",
      ].filter(Boolean),
      learningSummary: "No se pudo generar aprendizaje detallado (error de IA).",
    };
  }
}

/** Clasifica el estado de la suggestion segun la similitud. */
export function clasificarPorSimilitud(
  s: number,
): "used_without_changes" | "used_with_changes" | "used_with_major_changes" {
  if (s >= 0.95) return "used_without_changes";
  if (s >= 0.5) return "used_with_changes";
  return "used_with_major_changes";
}
