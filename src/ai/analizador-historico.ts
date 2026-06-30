import { openai } from "./openai.js";
import { config } from "../config.js";
import { CATEGORIAS } from "../types.js";
import type { Categoria } from "../types.js";

export interface AnalisisHistorico {
  category: Categoria | null;
  customerMessage: string;
  contextSummary: string;
  humanResponse: string;
  internalReasoningSummary: string;
  qualityScore: number; // 0..1
  buenEjemplo: boolean;
  reglaPropuesta: string;
  tags: string[];
}

const schema = {
  name: "analisis_historico",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: CATEGORIAS },
      customerMessage: { type: "string", description: "Resumen del problema/mensaje del cliente." },
      contextSummary: { type: "string", description: "Contexto breve del ticket." },
      humanResponse: { type: "string", description: "La respuesta final util del agente (resumida)." },
      internalReasoningSummary: { type: "string", description: "Procedimiento/razonamiento seguido por el agente." },
      qualityScore: { type: "number", description: "0 a 1: calidad del ticket como ejemplo." },
      buenEjemplo: { type: "boolean", description: "true si es buen ejemplo a reutilizar." },
      reglaPropuesta: { type: "string", description: "Regla generalizable aprendida, en una frase." },
      tags: { type: "array", items: { type: "string" } },
    },
    required: [
      "category", "customerMessage", "contextSummary", "humanResponse",
      "internalReasoningSummary", "qualityScore", "buenEjemplo", "reglaPropuesta", "tags",
    ],
  },
} as const;

/** Analiza una conversacion historica (ya anonimizada) y propone un ejemplo. */
export async function analizarHistorico(conversacion: string): Promise<AnalisisHistorico> {
  if (!openai) {
    return {
      category: null,
      customerMessage: "(demo) Resumen no disponible sin OPENAI_API_KEY.",
      contextSummary: "(demo)",
      humanResponse: "(demo)",
      internalReasoningSummary: "(demo)",
      qualityScore: 0.5,
      buenEjemplo: true,
      reglaPropuesta: "(demo offline) Configura OPENAI_API_KEY para el analisis real.",
      tags: [],
    };
  }
  try {
    const resp = await openai.chat.completions.create({
      model: config.openai.modeloGenerador,
      messages: [
        {
          role: "system",
          content:
            "Eres analista de calidad de atencion al cliente de Doccia Group (platos de ducha de resina). " +
            "Analizas una conversacion historica YA gestionada por el equipo y extraes un ejemplo de aprendizaje " +
            "reutilizable. Responde en espanol. No incluyas datos personales.",
        },
        {
          role: "user",
          content: `CONVERSACION HISTORICA (anonimizada):\n${conversacion}\n\nDevuelve el JSON pedido.`,
        },
      ],
      response_format: { type: "json_schema", json_schema: schema },
    });
    const data = JSON.parse(resp.choices[0]?.message?.content ?? "{}") as AnalisisHistorico;
    data.qualityScore = Math.max(0, Math.min(1, Number(data.qualityScore) || 0));
    return data;
  } catch (err) {
    console.warn("[analizador-historico] Fallo OpenAI:", err instanceof Error ? err.message : err);
    return {
      category: null,
      customerMessage: conversacion.slice(0, 200),
      contextSummary: "Analisis no disponible (error IA).",
      humanResponse: "",
      internalReasoningSummary: "",
      qualityScore: 0,
      buenEjemplo: false,
      reglaPropuesta: "",
      tags: [],
    };
  }
}
