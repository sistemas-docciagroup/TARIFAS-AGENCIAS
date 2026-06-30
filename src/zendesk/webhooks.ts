import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { nanoid } from "nanoid";
import { store } from "../db/index.js";
import { procesarTicket } from "../pipeline/procesar-ticket.js";
import { registrarMensajeFinal } from "../learning/pipeline.js";
import { obtenerTicketZendesk } from "./client.js";
import type { MessageType, Ticket, ZendeskTicketReview } from "../types.js";

/** Lee un setting booleano del store. Default true si no existe. */
async function settingActivo(key: string): Promise<boolean> {
  const s = await store.getSetting(key);
  return s ? s.value !== "false" : true;
}

const TIPOS_MENSAJE: MessageType[] = [
  "public_customer_reply",
  "internal_note",
  "side_conversation",
  "internal_department_reply",
  "forwarded_message",
];

/** Resuelve el ticket interno por id interno o por zendeskId. */
async function resolverTicket(body: Record<string, unknown>) {
  if (body.ticketId) return store.getTicket(String(body.ticketId));
  const zid = body.zendesk_ticket_id ?? body.ticket_id ?? body.id;
  if (zid == null) return null;
  const todos = await store.listTickets();
  return todos.find((t) => t.zendeskId === String(zid)) ?? null;
}

/**
 * Webhook de Zendesk. Recibe eventos (nuevo ticket, nueva respuesta de cliente,
 * cambio de estado/prioridad), normaliza el ticket y lanza el pipeline de IA.
 *
 * En esta fase la verificacion de firma es un placeholder; cuando configures
 * ZENDESK_WEBHOOK_SECRET se valida la cabecera de firma de Zendesk.
 */
export function registrarWebhooks(app: FastifyInstance) {
  app.get("/webhooks/zendesk", async (_req, reply) => reply.send({ ok: true }));
  app.get<{ Params: { ticketId: string } }>("/webhooks/zendesk/:ticketId", async (_req, reply) => reply.send({ ok: true }));

  async function procesarWebhook(zendeskId: string, body: Record<string, unknown>) {
    if (!zendeskId || zendeskId.includes("{{")) {
      await store.logSkippedEvent({ sourceEventId: null, zendeskTicketId: zendeskId || null, reason: "invalid_payload", payloadJson: body });
      return { error: "ticket_id invalido o test", status: 400 };
    }

    // --- Controles ON/OFF ---
    if (!(await settingActivo("zendesk_webhook_processing_enabled"))) {
      await store.logSkippedEvent({ sourceEventId: String(body.id ?? ""), zendeskTicketId: zendeskId, reason: "webhook_processing_disabled", payloadJson: body });
      return { ok: true, descartado: true, motivo: "webhook_processing_disabled" };
    }
    if (!(await settingActivo("zendesk_import_enabled"))) {
      await store.logSkippedEvent({ sourceEventId: String(body.id ?? ""), zendeskTicketId: zendeskId, reason: "import_disabled", payloadJson: body });
      return { ok: true, descartado: true, motivo: "import_disabled" };
    }

    // Descartar tickets de RingOver (llamadas telefónicas)
    const detailBody = (body.detail ?? {}) as Record<string, unknown>;
    const tags: string[] = Array.isArray(detailBody.tags) ? (detailBody.tags as string[]) : [];
    const viaChannel = String((detailBody.via as Record<string, unknown>)?.channel ?? "");
    const esLlamada = tags.includes("call_ringover") || viaChannel.includes("phone_call") || viaChannel.includes("api_phone");
    if (esLlamada) {
      console.log(`[webhook] Ticket ${zendeskId} descartado (RingOver/llamada)`);
      await store.logSkippedEvent({ sourceEventId: String(body.id ?? ""), zendeskTicketId: zendeskId, reason: "llamada_ringover", payloadJson: body });
      return { ok: true, descartado: true, motivo: "llamada_ringover" };
    }

    const existentes = await store.listTickets();
    if (existentes.find((t) => t.zendeskId === zendeskId)) {
      await store.logSkippedEvent({ sourceEventId: String(body.id ?? ""), zendeskTicketId: zendeskId, reason: "duplicate_event", payloadJson: body });
      return { ok: true, duplicado: true, zendeskId };
    }

    const zdData = await obtenerTicketZendesk(zendeskId);
    const canal = body.canal === "comerciales" ? "comerciales" : "clientes";
    const ahora = new Date().toISOString();

    const ticket: Ticket = {
      id: nanoid(),
      canal,
      zendeskId,
      clienteNombre: zdData?.clienteNombre ?? String(body.cliente_nombre ?? "Cliente"),
      clienteEmail: zdData?.clienteEmail ?? String(body.cliente_email ?? ""),
      empresa: zdData?.empresa ?? (body.empresa ? String(body.empresa) : null),
      estado: zdData?.estado ?? String(body.estado ?? "nuevo"),
      prioridad: zdData?.prioridad ?? (body.prioridad ? String(body.prioridad) : null),
      etiquetas: zdData?.etiquetas ?? (Array.isArray(body.etiquetas) ? (body.etiquetas as string[]) : []),
      asunto: zdData?.asunto ?? String(body.asunto ?? "(sin asunto)"),
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await store.upsertTicket(ticket);

    const mensajes = zdData?.mensajes ?? [{ autor: "cliente" as const, texto: String(body.mensaje ?? ""), creadoEn: ahora }];
    for (const m of mensajes) {
      await store.addMensaje({ id: nanoid(), ticketId: ticket.id, autor: m.autor, texto: m.texto, creadoEn: m.creadoEn });
    }

    // Crear ZendeskTicketReview para el panel de revisión
    const existingReview = await store.getTicketReviewByZendeskId(zendeskId);
    if (!existingReview) {
      const review: ZendeskTicketReview = {
        id: nanoid(),
        zendeskTicketId: zendeskId,
        subject: ticket.asunto,
        requesterId: zdData?.requesterId ?? null,
        organizationId: zdData?.organizationId ?? null,
        groupId: zdData?.groupId ?? null,
        assigneeId: zdData?.assigneeId ?? null,
        channel: (zdData?.canalEntrada ?? viaChannel) || null,
        inboundEmail: zdData?.emailEntrada ?? null,
        zendeskStatus: ticket.estado,
        zendeskPriority: ticket.prioridad,
        zendeskTagsJson: ticket.etiquetas,
        zendeskFormId: zdData?.formId ?? null,
        departamento: zdData?.departamento ?? null,
        submotivo: zdData?.submotivo ?? null,
        zendeskCategory: null,
        aiCategory: null,
        aiSubcategory: null,
        aiConfidence: null,
        aiRiskLevel: null,
        aiDetectedIntent: null,
        reviewStatus: "pendiente_revision",
        reviewedBy: null,
        reviewedAt: null,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };
      await store.saveTicketReview(review);
    }

    // Procesar con IA (respeta setting)
    if (!(await settingActivo("zendesk_ai_processing_enabled"))) {
      console.log(`[webhook] Ticket ${zendeskId} importado sin IA (ai_processing_disabled)`);
      await store.logSkippedEvent({ sourceEventId: String(body.id ?? ""), zendeskTicketId: zendeskId, reason: "ai_processing_disabled", payloadJson: {} });
      return { ok: true, ticketId: ticket.id, borradorId: null, motivo: "ai_processing_disabled" };
    }

    const borrador = await procesarTicket(ticket.id);

    console.log(`[webhook] Ticket ${zendeskId} procesado -> borrador ${borrador.id}`);
    return { ok: true, ticketId: ticket.id, borradorId: borrador.id };
  }

  function checkSecret(req: { headers: Record<string, unknown> }) {
    const secret = config.zendesk.webhookSecret;
    if (!secret) return true;
    const token = (req.headers["x-webhook-secret"] ?? String(req.headers["authorization"] ?? "").replace("Bearer ", "")) as string;
    return token === secret;
  }

  app.post<{ Params: { ticketId: string } }>("/webhooks/zendesk/:ticketId", async (req, reply) => {
    if (!checkSecret(req)) return reply.code(401).send({ error: "No autorizado" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const detail = (body.detail ?? {}) as Record<string, unknown>;
    // Si el param de URL es literal {{ticket.id}}, usar detail.id del body
    const paramId = req.params.ticketId;
    const zendeskId = (paramId && !paramId.includes("{{")) ? paramId : String(detail.id ?? "");
    const result = await procesarWebhook(zendeskId, body);
    if ("status" in result) return reply.code((result as { status: number }).status).send(result);
    return reply.send(result);
  });

  app.post("/webhooks/zendesk", async (req, reply) => {
    if (!checkSecret(req)) return reply.code(401).send({ error: "No autorizado" });
    const body = req.body as Record<string, unknown>;
    const detail = (body.detail ?? {}) as Record<string, unknown>;
    // body.id es el ID del evento webhook, NO del ticket — usar detail.id
    const zendeskId = String(body.ticket_id ?? detail.id ?? detail.ticket_id ?? "");
    const result = await procesarWebhook(zendeskId, body);
    if ("status" in result) return reply.code((result as { status: number }).status).send(result);
    return reply.send(result);
  });

  // --- Captura de mensajes finales (aprendizaje por correccion humana) ---
  // Zendesk dispara esto cuando un agente anade un comentario (publico, nota,
  // side conversation, interdepartamental, reenvio...). Deduplicamos por evento.
  app.post("/webhooks/zendesk/comment-created", async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const ticket = await resolverTicket(body);
    if (!ticket) return reply.code(404).send({ ok: false, error: "ticket no encontrado" });

    const tipo = String(body.message_type ?? "public_customer_reply") as MessageType;
    const messageType = TIPOS_MENSAJE.includes(tipo) ? tipo : "public_customer_reply";
    const sourceEventId = String(body.source_event_id ?? body.event_id ?? nanoid());

    const r = await registrarMensajeFinal({
      ticketId: ticket.id,
      zendeskTicketId: ticket.zendeskId,
      zendeskCommentId: body.comment_id ? String(body.comment_id) : null,
      messageType,
      visibility: body.visibility === "internal" ? "internal" : undefined,
      authorId: body.author_id ? String(body.author_id) : null,
      authorRole: body.author_role ? String(body.author_role) : null,
      bodyText: String(body.body_text ?? body.body ?? ""),
      bodyHtml: body.body_html ? String(body.body_html) : null,
      sourceEventId,
      agentId: body.agent_id ? String(body.agent_id) : null,
    });

    if (r.duplicado) return reply.send({ ok: true, duplicado: true });
    return reply.send({
      ok: true,
      matched: r.matched,
      learningEventId: r.learningEventId ?? null,
      suggestionStatus: r.suggestionStatus ?? null,
    });
  });

  // --- Actualizacion de ticket (asignado, grupo, estado) ---
  app.post("/webhooks/zendesk/ticket-updated", async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const ticket = await resolverTicket(body);
    if (!ticket) return reply.code(404).send({ ok: false, error: "ticket no encontrado" });
    const cambios: Partial<Ticket> = {};
    if (body.estado) cambios.estado = String(body.estado);
    if (body.prioridad) cambios.prioridad = String(body.prioridad);
    cambios.actualizadoEn = new Date().toISOString();
    await store.upsertTicket({ ...ticket, ...cambios });
    return reply.send({ ok: true, ticketId: ticket.id });
  });
}
