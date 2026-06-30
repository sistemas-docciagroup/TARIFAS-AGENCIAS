import { nanoid } from "nanoid";
import { store } from "../db/index.js";
import { compararTextos, clasificarPorSimilitud } from "../ai/comparador.js";
import type {
  AiSuggestion,
  Analisis,
  Borrador,
  MessageType,
  TargetType,
  Ticket,
  ZendeskFinalMessage,
} from "../types.js";

const VENTANA_MS = 24 * 60 * 60 * 1000; // 24 horas

/** Crea una ai_suggestion 'pending' a partir del borrador que genero la IA. */
export async function crearSuggestionDesdeBorrador(
  ticket: Ticket,
  borrador: Borrador,
  analisis: Analisis,
): Promise<AiSuggestion> {
  const targetType: TargetType = ticket.canal === "comerciales" ? "cliente" : "cliente";
  const sugg: AiSuggestion = {
    id: nanoid(),
    ticketId: ticket.id,
    borradorId: borrador.id,
    zendeskTicketId: ticket.zendeskId,
    zendeskCommentId: null,
    suggestionType: "public_customer_reply",
    targetType,
    suggestedText: borrador.textoPropuesto,
    suggestedSubject: ticket.asunto,
    modelUsed: borrador.modeloUsado,
    confidenceScore: analisis.confianza,
    category: analisis.categoria,
    groupId: null,
    assigneeId: null,
    requesterId: ticket.clienteEmail || null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await store.saveSuggestion(sugg);
  return sugg;
}

export interface EntradaMensajeFinal {
  ticketId: string;
  zendeskTicketId?: string | null;
  zendeskCommentId?: string | null;
  messageType: MessageType;
  visibility?: "public" | "internal";
  authorId?: string | null;
  authorRole?: string | null;
  recipientType?: TargetType;
  bodyText: string;
  bodyHtml?: string | null;
  sourceEventId: string;
  agentId?: string | null;
}

export interface ResultadoRegistro {
  duplicado?: boolean;
  finalMessage?: ZendeskFinalMessage;
  matched: boolean;
  learningEventId?: string;
  suggestionStatus?: string;
}

/**
 * Captura un mensaje final desde Zendesk (o desde el panel), lo deduplica,
 * intenta vincularlo con la suggestion pendiente del ticket y, si encaja,
 * genera el evento de aprendizaje (pendiente de aprobacion).
 */
export async function registrarMensajeFinal(
  e: EntradaMensajeFinal,
): Promise<ResultadoRegistro> {
  // 1. Dedup por id de evento
  if (await store.eventoYaProcesado(e.sourceEventId)) {
    return { duplicado: true, matched: false };
  }

  // 2. Buscar suggestion pendiente del mismo ticket dentro de la ventana de 24h
  const pendiente = await store.getSuggestionPendiente(e.ticketId);
  const dentroDeVentana =
    pendiente && Date.now() - new Date(pendiente.createdAt).getTime() <= VENTANA_MS;
  const matched = Boolean(pendiente && dentroDeVentana);

  // 3. Guardar el mensaje final (siempre, aunque no haya match -> unmatched)
  const final: ZendeskFinalMessage = {
    id: nanoid(),
    ticketId: e.ticketId,
    zendeskTicketId: e.zendeskTicketId ?? null,
    zendeskCommentId: e.zendeskCommentId ?? null,
    messageType: e.messageType,
    visibility: e.visibility ?? (e.messageType === "public_customer_reply" ? "public" : "internal"),
    authorId: e.authorId ?? null,
    authorRole: e.authorRole ?? null,
    recipientType: e.recipientType ?? "cliente",
    bodyText: e.bodyText,
    bodyHtml: e.bodyHtml ?? null,
    sourceEventId: e.sourceEventId,
    matched,
    createdAt: new Date().toISOString(),
  };
  await store.saveFinalMessage(final);

  if (!matched || !pendiente) {
    return { finalMessage: final, matched: false };
  }

  // 4. Comparar IA vs humano y clasificar
  const comp = await compararTextos(pendiente.suggestedText, e.bodyText);
  const nuevoEstado = clasificarPorSimilitud(comp.similarityScore);

  // 5. Crear evento de aprendizaje (pendiente de aprobacion humana)
  const learning = {
    id: nanoid(),
    ticketId: e.ticketId,
    suggestionId: pendiente.id,
    finalMessageId: final.id,
    originalAiText: pendiente.suggestedText,
    finalHumanText: e.bodyText,
    similarityScore: comp.similarityScore,
    diffSummary: comp.diffSummary,
    detectedChanges: comp.detectedChanges,
    learningSummary: comp.learningSummary,
    category: pendiente.category,
    agentId: e.agentId ?? e.authorId ?? null,
    status: "pending" as const,
    approvedForTraining: false,
    createdAt: new Date().toISOString(),
  };
  await store.saveLearningEvent(learning);

  // 6. Actualizar estado de la suggestion
  await store.updateSuggestion(pendiente.id, {
    status: nuevoEstado,
    zendeskCommentId: e.zendeskCommentId ?? pendiente.zendeskCommentId,
  });

  return {
    finalMessage: final,
    matched: true,
    learningEventId: learning.id,
    suggestionStatus: nuevoEstado,
  };
}

/** Marca como 'expired' las suggestions pendientes con mas de 24h. */
export async function expirarPendientes(): Promise<number> {
  const ahora = Date.now();
  let n = 0;
  for (const s of await store.listSuggestions()) {
    if (s.status === "pending" && ahora - new Date(s.createdAt).getTime() > VENTANA_MS) {
      await store.updateSuggestion(s.id, { status: "expired" });
      n++;
    }
  }
  return n;
}
