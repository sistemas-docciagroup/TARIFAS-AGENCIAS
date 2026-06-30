import { nanoid } from "nanoid";
import { store } from "../db/index.js";
import { clasificar } from "../ai/clasificador.js";
import { generarBorrador } from "../ai/generador.js";
import { recuperarKb } from "../kb/recuperador.js";
import { evaluarSeguridad } from "../seguridad/reglas.js";
import { crearSuggestionDesdeBorrador } from "../learning/pipeline.js";
import type { Borrador } from "../types.js";

/**
 * Orquesta los pasos del Modo Seguro para un ticket:
 *   1. recupera ticket + mensajes
 *   2. clasifica (OpenAI)
 *   3. evalua reglas de seguridad
 *   4. recupera KB relevante
 *   5. genera borrador (OpenAI)
 *   6. persiste analisis + borrador (+ evento de seguridad si escala)
 * NUNCA envia nada al cliente: solo deja un borrador pendiente de revision humana.
 */
export async function procesarTicket(ticketId: string): Promise<Borrador> {
  const ticket = await store.getTicket(ticketId);
  if (!ticket) throw new Error(`Ticket no encontrado: ${ticketId}`);
  const mensajes = await store.getMensajes(ticketId);

  // 2. Clasificar
  const analisis = await clasificar(ticket, mensajes);
  await store.saveAnalisis(analisis);

  // 3. Seguridad
  const seguridad = evaluarSeguridad(analisis);
  if (seguridad.escalar) {
    await store.saveEventoSeguridad({
      id: nanoid(),
      ticketId,
      reglaDisparada: seguridad.regla ?? "desconocida",
      detalle: seguridad.detalle ?? "",
      creadoEn: new Date().toISOString(),
    });
  }

  // 4. KB
  const fragmentos = await recuperarKb(ticket, mensajes);

  // 5. Generar borrador
  const { texto, modeloUsado } = await generarBorrador(
    ticket,
    mensajes,
    analisis,
    fragmentos,
  );

  // 6. Persistir borrador
  const borrador: Borrador = {
    id: nanoid(),
    ticketId,
    analisisId: analisis.id,
    textoPropuesto: texto,
    fragmentosKbUsados: fragmentos.map((d) => d.id),
    estado: seguridad.escalar ? "escalado" : "pendiente",
    confianza: analisis.confianza,
    modeloUsado,
    motivoEscalado: seguridad.escalar ? seguridad.detalle : null,
    creadoEn: new Date().toISOString(),
  };
  await store.saveBorrador(borrador);

  // Persistir borrador y conversación en el review para que sobrevivan reinicios.
  const review = await store.getTicketReviewByZendeskId(ticket.zendeskId);
  if (review) {
    await store.updateTicketReview(review.id, {
      aiDraftText: texto,
      mensajesTexto: mensajes.map((m) => ({ autor: m.autor, texto: m.texto, isPublic: true })),
      actualizadoEn: new Date().toISOString(),
    });
  }

  // Registramos la propuesta como ai_suggestion (trazabilidad / aprendizaje).
  await crearSuggestionDesdeBorrador(ticket, borrador, analisis);

  return borrador;
}
