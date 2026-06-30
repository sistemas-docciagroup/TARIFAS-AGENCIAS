import { nanoid } from "nanoid";
import { openai } from "./openai.js";
import { SYSTEM_CLASIFICADOR } from "./prompts.js";
import { config } from "../config.js";
import { CATEGORIAS } from "../types.js";
import type { Analisis, Categoria, Mensaje, Ticket, Urgencia } from "../types.js";

const jsonSchema = {
  name: "analisis_ticket",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      categoria: { type: "string", enum: CATEGORIAS },
      intencion: { type: "string" },
      urgencia: { type: "string", enum: ["baja", "media", "alta"] },
      enfado: { type: "number" },
      riesgo: { type: "number" },
      confianza: { type: "number" },
    },
    required: ["categoria", "intencion", "urgencia", "enfado", "riesgo", "confianza"],
  },
} as const;

/** Clasifica un ticket. Usa OpenAI si hay clave; si no, heuristica de demostracion. */
export async function clasificar(
  ticket: Ticket,
  mensajes: Mensaje[],
): Promise<Analisis> {
  const texto = mensajes.map((m) => `[${m.autor}] ${m.texto}`).join("\n");

  if (!openai) {
    return demoClasificar(ticket, texto);
  }

  try {
    const resp = await openai.chat.completions.create({
      model: config.openai.modeloClasificador,
      messages: [
        { role: "system", content: SYSTEM_CLASIFICADOR },
        {
          role: "user",
          content: `Asunto: ${ticket.asunto}\nEtiquetas: ${ticket.etiquetas.join(", ") || "(ninguna)"}\n\nMensajes:\n${texto}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: jsonSchema },
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const data = JSON.parse(raw) as Omit<Analisis, "id" | "ticketId" | "modeloUsado" | "creadoEn">;

    return {
      id: nanoid(),
      ticketId: ticket.id,
      ...data,
      enfado: clamp(data.enfado),
      riesgo: clamp(data.riesgo),
      confianza: clamp(data.confianza),
      modeloUsado: config.openai.modeloClasificador,
      creadoEn: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(
      `[clasificador] Fallo la llamada a OpenAI (${config.openai.modeloClasificador}). Uso modo demo. Detalle:`,
      err instanceof Error ? err.message : err,
    );
    return demoClasificar(ticket, texto);
  }
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Heuristica simple para que la app funcione sin clave de OpenAI. */
function demoClasificar(ticket: Ticket, texto: string): Analisis {
  const t = `${ticket.asunto} ${texto}`.toLowerCase();
  let categoria: Categoria = "consultas_generales";
  if (/garant|fisura|delamin|defecto|rotura de fabric/.test(t)) categoria = "garantias";
  else if (/envio|entrega|transport|tarda|seguimiento/.test(t)) categoria = "logistica";
  else if (/factur|cobro|importe|iva/.test(t)) categoria = "facturacion";
  else if (/presupuesto|precio|oferta/.test(t)) categoria = "presupuestos";
  else if (/instala|montaje|colocar/.test(t)) categoria = "instalacion";
  else if (/incidenc|problema|no funciona/.test(t)) categoria = "incidencias";

  const enfado = /denunci|abogado|estafa|harto|inadmisible|verguenza|fatal/.test(t) ? 0.85 : 0.2;
  const riesgo = /denunci|abogado|estafa|reclamac|legal|descuento especial/.test(t) ? 0.8 : 0.2;
  const urgencia: Urgencia = ticket.prioridad === "urgente" || enfado > 0.7 ? "alta" : "media";

  return {
    id: nanoid(),
    ticketId: ticket.id,
    categoria,
    intencion: "(demo offline) Resolver la consulta del cliente",
    urgencia,
    enfado,
    riesgo,
    // En demo: confianza alta salvo que el caso sea de riesgo (para que solo
    // escalen los tickets realmente delicados y se vea bien el flujo).
    confianza: riesgo >= 0.7 ? 0.5 : 0.8,
    modeloUsado: "demo-offline",
    creadoEn: new Date().toISOString(),
  };
}
