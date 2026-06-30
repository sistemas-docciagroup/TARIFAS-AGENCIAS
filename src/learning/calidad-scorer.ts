import type { HistoricalTicket, HistoricalComment } from "../types.js";

export interface CalidadResult {
  score: number;
  label: "excelente" | "bueno" | "mejorable" | "descartar";
  razones: string[];
}

export function calcularCalidad(ticket: HistoricalTicket, comments: HistoricalComment[]): CalidadResult {
  let score = 0;
  const razones: string[] = [];

  const publicos = comments.filter(c => c.isPublic);
  const msgsCliente = publicos.filter(c => c.authorRole === "cliente");
  const msgsAgente  = publicos.filter(c => c.authorRole === "agente");

  // ── Criterios positivos ──────────────────────────────────────────

  // Cliente tiene mensaje público sustancial
  const mejorMsgCliente = msgsCliente.sort((a, b) => b.bodyText.length - a.bodyText.length)[0];
  if (mejorMsgCliente && mejorMsgCliente.bodyText.trim().length >= 40) {
    score += 25;
    razones.push("✓ Cliente describe el problema con detalle");
  } else if (mejorMsgCliente && mejorMsgCliente.bodyText.trim().length >= 15) {
    score += 12;
    razones.push("~ Cliente tiene mensaje pero escueto");
  }

  // Agente tiene respuesta pública sustancial
  const mejorMsgAgente = msgsAgente.sort((a, b) => b.bodyText.length - a.bodyText.length)[0];
  if (mejorMsgAgente && mejorMsgAgente.bodyText.trim().length >= 80) {
    score += 25;
    razones.push("✓ Agente responde con detalle");
  } else if (mejorMsgAgente && mejorMsgAgente.bodyText.trim().length >= 20) {
    score += 12;
    razones.push("~ Agente responde pero de forma breve");
  }

  // Ticket resuelto/cerrado
  if (ticket.status === "solved" || ticket.status === "closed") {
    score += 15;
    razones.push("✓ Ticket resuelto");
  }

  // El cliente fue el primero en escribir (contexto completo)
  if (!ticket.primeraRespuestaEsAgente) {
    score += 10;
    razones.push("✓ Conversación empieza por el cliente");
  }

  // Número de turnos razonable (2-8 mensajes públicos)
  if (publicos.length >= 2 && publicos.length <= 8) {
    score += 10;
    razones.push(`✓ Conversación de longitud óptima (${publicos.length} mensajes)`);
  } else if (publicos.length > 8) {
    score += 3;
    razones.push(`~ Conversación larga (${publicos.length} mensajes)`);
  }

  // Tiene adjuntos (foto, documento) — enriquece el contexto
  const totalAdjuntos = comments.reduce((n, c) => n + (c.attachments?.length ?? 0), 0);
  if (totalAdjuntos > 0) {
    score += 5;
    razones.push(`✓ Tiene ${totalAdjuntos} adjunto(s)`);
  }

  // Hay respuesta del agente MÁS LARGA (explicación completa > 200 chars)
  if (mejorMsgAgente && mejorMsgAgente.bodyText.trim().length >= 200) {
    score += 10;
    razones.push("✓ Respuesta del agente muy completa");
  }

  // ── Penalizaciones ───────────────────────────────────────────────

  // Sin ningún mensaje público del cliente
  if (msgsCliente.length === 0) {
    score -= 30;
    razones.push("✗ Sin mensajes del cliente");
  }

  // Sin ninguna respuesta pública del agente
  if (msgsAgente.length === 0) {
    score -= 20;
    razones.push("✗ Sin respuesta del agente");
  }

  // Contexto incompleto (agente abre el ticket — llamada previa, etc.)
  if (ticket.primeraRespuestaEsAgente) {
    score -= 15;
    razones.push("✗ Contexto incompleto — el agente abre la conversación");
  }

  // Ticket derivado de otro sin contexto del padre
  if (ticket.origenRel === "follow_up" && !ticket.origenTicketId) {
    score -= 10;
    razones.push("✗ Derivado de otro ticket sin contexto del padre");
  }

  // Canal voz — normalmente no tiene texto transcrito
  if (ticket.origenCanal === "voice") {
    score -= 10;
    razones.push("✗ Canal voz — puede faltar transcripción");
  }

  // Solo 1 mensaje en total
  if (publicos.length <= 1) {
    score -= 15;
    razones.push("✗ Conversación de un solo mensaje");
  }

  // Mensaje del cliente muy corto (saludo, ok, gracias)
  if (mejorMsgCliente && mejorMsgCliente.bodyText.trim().length < 15) {
    score -= 10;
    razones.push("✗ Mensaje del cliente demasiado corto");
  }

  score = Math.max(0, Math.min(100, score));

  const label: CalidadResult["label"] =
    score >= 75 ? "excelente" :
    score >= 55 ? "bueno" :
    score >= 35 ? "mejorable" : "descartar";

  return { score, label, razones };
}
