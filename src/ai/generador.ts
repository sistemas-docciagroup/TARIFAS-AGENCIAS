import { openai } from "./openai.js";
import { TONOS } from "./prompts.js";
import { config } from "../config.js";
import { store } from "../db/index.js";
import type { Analisis, Canal, DocumentoKB, Mensaje, Ticket } from "../types.js";

/** Reglas activas en KB filtradas por canal — se inyectan siempre en el prompt. */
async function bloqueReglas(canal: Canal): Promise<string> {
  const docs = await store.listKb();
  const dominiosCanal: Record<Canal, string[]> = {
    clientes:    ["GLOBAL", "DOCCIA_CLIENTES"],
    comerciales: ["GLOBAL", "DOCCIA_COMERCIAL"],
    bellobath:   ["GLOBAL", "BELLOBATH"],
  };
  const dominios = dominiosCanal[canal];
  const reglas = docs.filter(
    (d) => d.tipo === "regla" && d.status === "activo" && dominios.includes(d.dominio),
  );
  if (reglas.length === 0) return "";
  const lista = reglas.map((r) => `- ${r.texto}`).join("\n");
  return `\n\nREGLAS APROBADAS POR EL EQUIPO (aplicalas siempre):\n${lista}`;
}

export interface ResultadoBorrador {
  texto: string;
  modeloUsado: string;
}

function contextoDe(fragmentosKb: DocumentoKB[]): string {
  return fragmentosKb.length > 0
    ? fragmentosKb.map((d) => `### ${d.titulo}\n${d.texto}`).join("\n\n")
    : "(No hay documentacion relevante en la base de conocimiento.)";
}

/** Llamada central al modelo de redaccion. Devuelve texto + modelo usado. */
async function redactar(
  canal: Canal,
  contenidoUsuario: string,
  fallback: () => ResultadoBorrador,
): Promise<ResultadoBorrador> {
  if (!openai) return fallback();
  try {
    const systemPrompt = TONOS[canal] + (await bloqueReglas(canal));
    const resp = await openai.chat.completions.create({
      model: config.openai.modeloGenerador,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contenidoUsuario },
      ],
    });
    return {
      texto: resp.choices[0]?.message?.content?.trim() ?? "",
      modeloUsado: config.openai.modeloGenerador,
    };
  } catch (err) {
    console.warn(
      `[generador] Fallo OpenAI (${config.openai.modeloGenerador}). Uso modo demo. Detalle:`,
      err instanceof Error ? err.message : err,
    );
    return fallback();
  }
}

/** Genera el borrador de respuesta a un TICKET (canal segun el ticket). */
export async function generarBorrador(
  ticket: Ticket,
  mensajes: Mensaje[],
  analisis: Analisis,
  fragmentosKb: DocumentoKB[],
): Promise<ResultadoBorrador> {
  const hilo = mensajes.map((m) => `[${m.autor}] ${m.texto}`).join("\n");
  const contenido =
    `DOCUMENTACION INTERNA (unica fuente de verdad):\n${contextoDe(fragmentosKb)}\n\n` +
    `TICKET: ${ticket.asunto}\nCliente: ${ticket.clienteNombre}\n` +
    `Categoria detectada: ${analisis.categoria}\n\n` +
    `CONVERSACION:\n${hilo}\n\n` +
    `Redacta un borrador de respuesta siguiendo tu tono. ` +
    `Si falta informacion en la documentacion, no la inventes: pidela o indica derivacion a una persona.`;
  return redactar(ticket.canal, contenido, () => demoBorrador(ticket.clienteNombre, ticket.asunto, fragmentosKb));
}

export interface TurnoChat {
  rol: "user" | "assistant";
  texto: string;
}

/** Genera una respuesta para el CHATBOX de prueba manteniendo el historial de conversacion. */
export async function generarRespuestaChat(
  canal: Canal,
  mensajeUsuario: string,
  fragmentosKb: DocumentoKB[],
  historialPrevio: TurnoChat[] = [],
): Promise<ResultadoBorrador> {
  if (!openai) return demoChat(canal, fragmentosKb);

  try {
    const systemPrompt =
      TONOS[canal] +
      (await bloqueReglas(canal)) +
      `\n\nDOCUMENTACION INTERNA (unica fuente de verdad):\n${contextoDe(fragmentosKb)}\n\n` +
      `Responde siguiendo tu tono. Si falta informacion en la documentacion, no la inventes: ` +
      `pide los datos que falten o indica que lo revisara una persona del equipo.`;

    // Reconstruimos el array messages con todo el historial previo + mensaje actual
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...historialPrevio.map((t) => ({ role: t.rol, content: t.texto })),
      { role: "user", content: mensajeUsuario },
    ];

    const resp = await openai.chat.completions.create({
      model: config.openai.modeloGenerador,
      messages,
    });

    return {
      texto: resp.choices[0]?.message?.content?.trim() ?? "",
      modeloUsado: config.openai.modeloGenerador,
    };
  } catch (err) {
    console.warn(
      `[generador] Fallo OpenAI chatbox. Uso modo demo. Detalle:`,
      err instanceof Error ? err.message : err,
    );
    return demoChat(canal, fragmentosKb);
  }
}

function demoBorrador(nombre: string, asunto: string, fragmentosKb: DocumentoKB[]): ResultadoBorrador {
  const fuente = fragmentosKb[0]?.titulo ?? "nuestra documentacion";
  return {
    texto:
      `Hola ${nombre},\n\nGracias por contactar con Doccia. Hemos recibido tu consulta sobre "${asunto}".\n\n` +
      `(BORRADOR DEMO sin IA real — configura OPENAI_API_KEY para respuestas de GPT.) ` +
      `Segun ${fuente}, podemos ayudarte. Una persona del equipo revisara tu caso.\n\n` +
      `Un saludo,\nEquipo Doccia`,
    modeloUsado: "demo-offline",
  };
}

function demoChat(canal: Canal, fragmentosKb: DocumentoKB[]): ResultadoBorrador {
  const fuente = fragmentosKb[0]?.titulo ?? "la documentacion disponible";
  return {
    texto:
      `(DEMO ${canal} sin IA real) Segun ${fuente}, esto es lo que puedo decirte. ` +
      `Configura OPENAI_API_KEY para respuestas reales de GPT.`,
    modeloUsado: "demo-offline",
  };
}
