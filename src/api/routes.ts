import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { store } from "../db/index.js";
import { procesarTicket } from "../pipeline/procesar-ticket.js";
import { enviarRespuestaZendesk } from "../zendesk/client.js";
import { openai } from "../ai/openai.js";
import { config, iaActiva } from "../config.js";
import { recuperarKbPorTexto } from "../kb/recuperador.js";
import { generarRespuestaChat, type TurnoChat } from "../ai/generador.js";
import { registrarMensajeFinal, expirarPendientes } from "../learning/pipeline.js";
import { lanzarImportacion, analizarJob } from "../learning/importador.js";
import { detectarYTraducir } from "../ai/traductor.js";
import { calcularCalidad } from "../learning/calidad-scorer.js";
import { CANALES } from "../types.js";
import { extraerTexto, detectarFormato } from "../kb/extractor.js";
import { sincronizarKbMd } from "../kb/sync-md.js";
import type {
  Canal,
  CategoriaIA,
  ChatboxDomainPermission,
  DocumentoKB,
  DominioKB,
  TipoDocumento,
  CategoriaKB,
  NivelAcceso,
  UsadoPorKB,
  PrioridadKB,
  StatusKB,
  EjemploEntrenamiento,
  FiltrosImportacion,
  KnowledgeDomain,
  ReglaAprendida,
  ReviewStatus,
  TicketClassificationCorrection,
  ZendeskTicketReview,
} from "../types.js";

export function registrarApi(app: FastifyInstance) {
  // --- Estado / test del motor IA ---
  app.get("/api/ia/test", async () => {
    if (!openai) {
      return {
        ok: false,
        iaActiva: false,
        mensaje: "Sin OPENAI_API_KEY: la app funciona en modo demo offline.",
      };
    }
    try {
      const resp = await openai.chat.completions.create({
        model: config.openai.modeloGenerador,
        messages: [{ role: "user", content: "Responde solo con: OK" }],
      });
      return {
        ok: true,
        iaActiva,
        modelo: config.openai.modeloGenerador,
        respuesta: resp.choices[0]?.message?.content?.trim() ?? "",
      };
    } catch (err) {
      return {
        ok: false,
        iaActiva,
        modelo: config.openai.modeloGenerador,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // --- Cola de revision: tickets con su borrador y analisis ---
  app.get("/api/tickets", async () => {
    const tickets = await store.listTickets();
    const resultado = [];
    for (const ticket of tickets) {
      const borrador = await store.getBorradorPorTicket(ticket.id);
      const analisis = borrador ? await store.getAnalisis(borrador.analisisId) : null;
      resultado.push({ ticket, borrador, analisis });
    }
    return resultado;
  });

  // --- Detalle de un ticket ---
  app.get<{ Params: { id: string } }>("/api/tickets/:id", async (req, reply) => {
    const ticket = await store.getTicket(req.params.id);
    if (!ticket) return reply.code(404).send({ error: "Ticket no encontrado" });
    const mensajes = await store.getMensajes(ticket.id);
    const borrador = await store.getBorradorPorTicket(ticket.id);
    const analisis = borrador ? await store.getAnalisis(borrador.analisisId) : null;
    return { ticket, mensajes, borrador, analisis };
  });

  // --- Procesar (o reprocesar) un ticket con la IA ---
  app.post<{ Params: { id: string } }>("/api/tickets/:id/procesar", async (req) => {
    const borrador = await procesarTicket(req.params.id);
    return { ok: true, borrador };
  });

  // --- Aprobar borrador: envia a Zendesk tal cual ---
  app.post<{ Params: { id: string } }>("/api/borradores/:id/aprobar", async (req, reply) => {
    const borrador = await store.getBorrador(req.params.id);
    if (!borrador) return reply.code(404).send({ error: "Borrador no encontrado" });
    const ticket = await store.getTicket(borrador.ticketId);

    await enviarRespuestaZendesk(ticket?.zendeskId ?? "", borrador.textoPropuesto);
    const actualizado = await store.updateBorrador(borrador.id, { estado: "aprobado" });
    await store.saveCorreccion({
      id: nanoid(),
      borradorId: borrador.id,
      asuntoTicket: ticket?.asunto ?? "",
      textoPropuestoIa: borrador.textoPropuesto,
      estadoFinal: "aprobado",
      textoFinalEnviado: borrador.textoPropuesto,
      motivoRechazo: null,
      agenteId: "agente-demo",
      creadoEn: new Date().toISOString(),
    });
    // Trazabilidad/aprendizaje: registra el envio final (aprobado = sin cambios).
    await registrarMensajeFinal({
      ticketId: borrador.ticketId,
      zendeskTicketId: ticket?.zendeskId ?? null,
      messageType: "public_customer_reply",
      authorRole: "agent",
      bodyText: borrador.textoPropuesto,
      sourceEventId: `panel-aprobar-${borrador.id}-${Date.now()}`,
      agentId: "agente-demo",
    });
    return { ok: true, borrador: actualizado };
  });

  // --- Editar borrador: guarda texto final, envia y registra correccion ---
  app.post<{ Params: { id: string }; Body: { texto: string } }>(
    "/api/borradores/:id/editar",
    async (req, reply) => {
      const borrador = await store.getBorrador(req.params.id);
      if (!borrador) return reply.code(404).send({ error: "Borrador no encontrado" });
      const textoFinal = req.body?.texto ?? "";
      const ticket = await store.getTicket(borrador.ticketId);

      await enviarRespuestaZendesk(ticket?.zendeskId ?? "", textoFinal);
      await store.saveCorreccion({
        id: nanoid(),
        borradorId: borrador.id,
        asuntoTicket: ticket?.asunto ?? "",
        textoPropuestoIa: borrador.textoPropuesto, // lo que la IA propuso (antes de editar)
        estadoFinal: "editado",
        textoFinalEnviado: textoFinal,
        motivoRechazo: null,
        agenteId: "agente-demo",
        creadoEn: new Date().toISOString(),
      });
      // Aprendizaje: compara la propuesta IA con el texto final editado por el humano.
      const reg = await registrarMensajeFinal({
        ticketId: borrador.ticketId,
        zendeskTicketId: ticket?.zendeskId ?? null,
        messageType: "public_customer_reply",
        authorRole: "agent",
        bodyText: textoFinal,
        sourceEventId: `panel-editar-${borrador.id}-${Date.now()}`,
        agentId: "agente-demo",
      });
      const actualizado = await store.updateBorrador(borrador.id, {
        estado: "editado",
        textoPropuesto: textoFinal,
      });
      return { ok: true, borrador: actualizado, learningEventId: reg.learningEventId ?? null };
    },
  );

  // --- Rechazar borrador ---
  app.post<{ Params: { id: string }; Body: { motivo?: string } }>(
    "/api/borradores/:id/rechazar",
    async (req, reply) => {
      const borrador = await store.getBorrador(req.params.id);
      if (!borrador) return reply.code(404).send({ error: "Borrador no encontrado" });
      const ticket = await store.getTicket(borrador.ticketId);
      const actualizado = await store.updateBorrador(borrador.id, { estado: "rechazado" });
      await store.saveCorreccion({
        id: nanoid(),
        borradorId: borrador.id,
        asuntoTicket: ticket?.asunto ?? "",
        textoPropuestoIa: borrador.textoPropuesto,
        estadoFinal: "rechazado",
        textoFinalEnviado: "",
        motivoRechazo: req.body?.motivo ?? "(sin motivo)",
        agenteId: "agente-demo",
        creadoEn: new Date().toISOString(),
      });
      // Marca la suggestion como rechazada (no paso a uso).
      const sugg = await store.getSuggestionPendiente(borrador.ticketId);
      if (sugg) await store.updateSuggestion(sugg.id, { status: "rejected" });
      return { ok: true, borrador: actualizado };
    },
  );

  // --- Chatbox de prueba. Mantiene historial en el cliente y lo recibe en cada peticion. ---
  app.post<{ Body: { canal?: string; mensaje?: string; historial?: TurnoChat[] } }>("/api/chat", async (req, reply) => {
    const canal = (req.body?.canal as Canal) ?? "clientes";
    const mensaje = (req.body?.mensaje ?? "").trim();
    const historial: TurnoChat[] = Array.isArray(req.body?.historial) ? req.body.historial : [];
    if (!CANALES.includes(canal)) return reply.code(400).send({ error: "canal invalido" });
    if (!mensaje) return reply.code(400).send({ error: "mensaje vacio" });

    // Buscamos fragmentos KB usando todo el contexto de la conversacion, no solo el ultimo mensaje
    const consulta = [
      ...historial.filter((t) => t.rol === "user").map((t) => t.texto),
      mensaje,
    ].join(" ");
    const fragmentos = await recuperarKbPorTexto(consulta, canal);
    const { texto, modeloUsado } = await generarRespuestaChat(canal, mensaje, fragmentos, historial);
    return {
      canal,
      texto,
      modeloUsado,
      fuentes: fragmentos.map((f) => ({ id: f.id, titulo: f.titulo, dominio: f.dominio })),
    };
  });

  // --- Base de conocimiento ---
  app.get("/api/kb", async () => store.listKb());

  app.post<{ Body: Partial<DocumentoKB> }>("/api/kb", async (req, reply) => {
    const b = req.body ?? {};
    if (!b.titulo || !b.texto) {
      return reply.code(400).send({ error: "titulo y texto son obligatorios" });
    }
    const ahora = new Date().toISOString();
    const doc: DocumentoKB = {
      id: nanoid(),
      titulo: b.titulo,
      descripcion: b.descripcion ?? "",
      tipo: (b.tipo as TipoDocumento) ?? "faq",
      dominio: (b.dominio as DominioKB) ?? "GLOBAL",
      categoria: (b.categoria as CategoriaKB) ?? "Sin clasificar",
      subcategoria: b.subcategoria ?? null,
      nivelAcceso: (b.nivelAcceso as NivelAcceso) ?? "clientes",
      usadoPor: Array.isArray(b.usadoPor) ? (b.usadoPor as UsadoPorKB[]) : ["chatbox_doccia_clientes"],
      prioridad: (b.prioridad as PrioridadKB) ?? "medium",
      texto: b.texto,
      status: (b.status as StatusKB) ?? "activo",
      tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
      fuente: b.fuente ?? null,
      version: b.version ?? "1.0",
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await store.addKb(doc);
    sincronizarKbMd(await store.listKb());
    return { ok: true, doc };
  });

  app.put<{ Params: { id: string }; Body: Partial<DocumentoKB> }>("/api/kb/:id", async (req, reply) => {
    const b = req.body ?? {};
    const cambios: Partial<DocumentoKB> = { actualizadoEn: new Date().toISOString() };
    if (b.titulo     !== undefined) cambios.titulo     = b.titulo;
    if (b.descripcion!== undefined) cambios.descripcion= b.descripcion;
    if (b.tipo       !== undefined) cambios.tipo       = b.tipo as TipoDocumento;
    if (b.dominio    !== undefined) cambios.dominio    = b.dominio as DominioKB;
    if (b.categoria  !== undefined) cambios.categoria  = b.categoria as CategoriaKB;
    if (b.subcategoria!==undefined) cambios.subcategoria= b.subcategoria;
    if (b.nivelAcceso!== undefined) cambios.nivelAcceso= b.nivelAcceso as NivelAcceso;
    if (b.usadoPor   !== undefined) cambios.usadoPor   = b.usadoPor as UsadoPorKB[];
    if (b.prioridad  !== undefined) cambios.prioridad  = b.prioridad as PrioridadKB;
    if (b.texto      !== undefined) cambios.texto      = b.texto;
    if (b.tags       !== undefined) cambios.tags       = b.tags as string[];
    if (b.fuente     !== undefined) cambios.fuente     = b.fuente;
    if (b.version    !== undefined) cambios.version    = b.version;
    const doc = await store.updateKb(req.params.id, cambios);
    if (!doc) return reply.code(404).send({ error: "Documento no encontrado" });
    sincronizarKbMd(await store.listKb());
    return { ok: true, doc };
  });

  app.delete<{ Params: { id: string } }>("/api/kb/:id", async (req) => {
    await store.deleteKb(req.params.id);
    sincronizarKbMd(await store.listKb());
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/kb/:id/activar", async (req, reply) => {
    const doc = await store.updateKb(req.params.id, { status: "activo", actualizadoEn: new Date().toISOString() });
    if (!doc) return reply.code(404).send({ error: "no encontrado" });
    sincronizarKbMd(await store.listKb());
    return { ok: true, doc };
  });

  app.post<{ Params: { id: string } }>("/api/kb/:id/desactivar", async (req, reply) => {
    const doc = await store.updateKb(req.params.id, { status: "inactivo", actualizadoEn: new Date().toISOString() });
    if (!doc) return reply.code(404).send({ error: "no encontrado" });
    sincronizarKbMd(await store.listKb());
    return { ok: true, doc };
  });

  // Subir archivo y extraer texto automaticamente
  app.post("/api/kb/upload", async (req, reply) => {
    let titulo = "";
    let descripcion = "";
    let tipo: TipoDocumento = "faq";
    let dominio: DominioKB = "GLOBAL";
    let categoria: CategoriaKB = "Sin clasificar";
    let nivelAcceso: NivelAcceso = "clientes";
    let usadoPorRaw = "";
    let fileBuffer: Buffer | null = null;
    let nombreArchivo = "";

    for await (const part of req.parts()) {
      if (part.type === "file") {
        nombreArchivo = part.filename;
        fileBuffer = await part.toBuffer();
      } else {
        const val = (part as unknown as { value: string }).value ?? "";
        if (part.fieldname === "titulo")      titulo      = val.trim();
        if (part.fieldname === "descripcion") descripcion = val.trim();
        if (part.fieldname === "tipo")        tipo        = val as TipoDocumento;
        if (part.fieldname === "dominio")     dominio     = val as DominioKB;
        if (part.fieldname === "categoria")   categoria   = val as CategoriaKB;
        if (part.fieldname === "nivelAcceso") nivelAcceso = val as NivelAcceso;
        if (part.fieldname === "usadoPor")    usadoPorRaw = val;
      }
    }

    if (!fileBuffer || !nombreArchivo) {
      return reply.code(400).send({ error: "No se recibio ningun archivo." });
    }
    if (!detectarFormato(nombreArchivo)) {
      return reply.code(400).send({
        error: `Formato no soportado: ${nombreArchivo}. Usa PDF, Excel (.xlsx/.xls), Word (.docx), CSV o TXT.`,
      });
    }
    if (fileBuffer.length === 0) {
      return reply.code(400).send({ error: "El archivo esta vacio." });
    }

    let extraccion;
    try {
      extraccion = await extraerTexto(fileBuffer, nombreArchivo);
    } catch (err) {
      return reply.code(422).send({ error: err instanceof Error ? err.message : "Error al procesar el archivo." });
    }

    if (!extraccion.texto || extraccion.texto.length < 10) {
      return reply.code(422).send({ error: "No se pudo extraer texto del archivo (puede estar escaneado o protegido)." });
    }

    const usadoPor: UsadoPorKB[] = usadoPorRaw
      ? (usadoPorRaw.split(",").map(s => s.trim()).filter(Boolean) as UsadoPorKB[])
      : ["chatbox_doccia_clientes"];

    const ahora = new Date().toISOString();
    const doc: DocumentoKB = {
      id: nanoid(),
      titulo: titulo || extraccion.tituloSugerido,
      descripcion,
      tipo,
      dominio,
      categoria,
      subcategoria: null,
      nivelAcceso,
      usadoPor,
      prioridad: "medium",
      texto: extraccion.texto,
      status: "activo",
      tags: [],
      fuente: nombreArchivo,
      version: "1.0",
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await store.addKb(doc);
    sincronizarKbMd(await store.listKb());
    return { ok: true, doc, caracteresExtraidos: extraccion.texto.length };
  });

  // --- Aprendizaje: correcciones registradas + eventos de seguridad ---
  app.get("/api/correcciones", async () => {
    const correcciones = await store.listCorrecciones();
    // El registro ya es autosuficiente (guarda asunto y texto propuesto dentro).
    return correcciones
      .map((c) => ({
        correccion: c,
        asunto: c.asuntoTicket,
        textoPropuestoIa: c.textoPropuestoIa,
        estadoBorrador: c.estadoFinal,
      }))
      .sort((a, b) => b.correccion.creadoEn.localeCompare(a.correccion.creadoEn));
  });

  app.get("/api/eventos-seguridad", async () => store.listEventosSeguridad());

  // ============================================================
  //  APRENDIZAJE POR CORRECCION HUMANA
  // ============================================================

  // Lista de propuestas de la IA con su estado de ciclo de vida.
  app.get("/ai/suggestions", async () => {
    await expirarPendientes(); // marca como 'expired' las de >24h
    return store.listSuggestions();
  });

  // Crear una suggestion manualmente (p. ej. desde una integracion externa).
  app.post("/ai/suggestions", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!b.ticketId || !b.suggestedText) {
      return reply.code(400).send({ error: "ticketId y suggestedText son obligatorios" });
    }
    const s = {
      id: nanoid(),
      ticketId: String(b.ticketId),
      borradorId: null,
      zendeskTicketId: b.zendeskTicketId ? String(b.zendeskTicketId) : null,
      zendeskCommentId: null,
      suggestionType: "public_customer_reply" as const,
      targetType: "cliente" as const,
      suggestedText: String(b.suggestedText),
      suggestedSubject: b.suggestedSubject ? String(b.suggestedSubject) : null,
      modelUsed: String(b.modelUsed ?? "externo"),
      confidenceScore: Number(b.confidenceScore ?? 0),
      category: null,
      groupId: null,
      assigneeId: null,
      requesterId: null,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };
    await store.saveSuggestion(s);
    return { ok: true, suggestion: s };
  });

  // Eventos de aprendizaje (comparaciones IA vs humano), pendientes de aprobacion.
  app.get("/ai/learning-events", async () => {
    const eventos = await store.listLearningEvents();
    const finales = await store.listFinalMessages();
    const noVinculados = finales.filter((f) => !f.matched).length;
    return { eventos, unmatchedFinalMessages: noVinculados };
  });

  app.post<{ Params: { id: string } }>("/ai/learning-events/:id/approve", async (req, reply) => {
    const ev = await store.getLearningEvent(req.params.id);
    if (!ev) return reply.code(404).send({ error: "no encontrado" });
    const actualizado = await store.updateLearningEvent(ev.id, {
      status: "approved",
      approvedForTraining: true,
    });
    // Crea doc en KB como pendiente de revisión
    const ahora = new Date().toISOString();
    const titulo = ev.learningSummary
      ? ev.learningSummary.slice(0, 120).replace(/\s+/g, " ").trim()
      : `Aprendizaje ${ev.id.slice(0, 6)}`;
    const kbDoc: DocumentoKB = {
      id: nanoid(),
      titulo,
      descripcion: `Aprendido de corrección humana (ticket vinculado: ${ev.ticketId ?? "—"})`,
      texto: ev.learningSummary ?? ev.diffSummary ?? "",
      tipo: "caso_aprendido" as TipoDocumento,
      dominio: "CASOS_APRENDIDOS" as DominioKB,
      categoria: (ev.category ?? "Sin clasificar") as CategoriaKB,
      subcategoria: null,
      nivelAcceso: "clientes" as NivelAcceso,
      usadoPor: ["chatbox_doccia_clientes", "chatbox_doccia_comercial", "chatbox_bellobath"],
      prioridad: "medium",
      status: "pendiente",
      tags: ["aprendizaje-automatico"],
      fuente: `learning-event:${ev.id}`,
      version: "1.0",
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await store.addKb(kbDoc);
    sincronizarKbMd(await store.listKb());
    return { ok: true, learningEvent: actualizado, kbDoc };
  });

  app.post<{ Params: { id: string } }>("/ai/learning-events/:id/reject", async (req, reply) => {
    const ev = await store.getLearningEvent(req.params.id);
    if (!ev) return reply.code(404).send({ error: "no encontrado" });
    const actualizado = await store.updateLearningEvent(ev.id, { status: "rejected" });
    return { ok: true, learningEvent: actualizado };
  });

  // Convertir un aprendizaje en REGLA — se guarda en KB (tipo "regla", status pendiente).
  // Los docs KB tipo "regla" + status "activo" se inyectan siempre en el prompt.
  app.post<{ Params: { id: string }; Body: { marca?: "ambas" | "doccia" | "bellobath" } }>(
    "/ai/learning-events/:id/convert-to-rule",
    async (req, reply) => {
      const ev = await store.getLearningEvent(req.params.id);
      if (!ev) return reply.code(404).send({ error: "no encontrado" });
      const marca = req.body?.marca ?? "ambas";
      const dominioPorMarca: Record<string, DominioKB> = {
        ambas:     "GLOBAL",
        doccia:    "DOCCIA_CLIENTES",
        bellobath: "BELLOBATH",
      };
      const usadoPorPorMarca: Record<string, UsadoPorKB[]> = {
        ambas:     ["chatbox_doccia_clientes", "chatbox_doccia_comercial", "chatbox_bellobath"],
        doccia:    ["chatbox_doccia_clientes", "chatbox_doccia_comercial"],
        bellobath: ["chatbox_bellobath"],
      };
      const ahora = new Date().toISOString();
      const titulo = (ev.learningSummary ?? ev.diffSummary ?? "").slice(0, 120).trim();
      const kbDoc: DocumentoKB = {
        id: nanoid(),
        titulo: titulo || `Regla aprendida ${ev.id.slice(0, 6)}`,
        descripcion: `Regla generada desde corrección humana (ticket: ${ev.ticketId ?? "—"})`,
        texto: ev.learningSummary ?? ev.diffSummary ?? "",
        tipo: "regla" as TipoDocumento,
        dominio: dominioPorMarca[marca],
        categoria: (ev.category ?? "Sin clasificar") as CategoriaKB,
        subcategoria: null,
        nivelAcceso: "clientes" as NivelAcceso,
        usadoPor: usadoPorPorMarca[marca],
        prioridad: "high",
        status: "pendiente",
        tags: ["regla-aprendida"],
        fuente: `learning-event:${ev.id}`,
        version: "1.0",
        creadoEn: ahora,
        actualizadoEn: ahora,
      };
      await store.addKb(kbDoc);
      sincronizarKbMd(await store.listKb());
      await store.updateLearningEvent(ev.id, { status: "approved" });
      return { ok: true, kbDoc, marca };
    },
  );

  // Convertir un aprendizaje en EJEMPLO de entrenamiento.
  app.post<{ Params: { id: string } }>("/ai/learning-events/:id/convert-to-training", async (req, reply) => {
    const ev = await store.getLearningEvent(req.params.id);
    if (!ev) return reply.code(404).send({ error: "no encontrado" });
    const ejemplo: EjemploEntrenamiento = {
      id: nanoid(),
      textoIa: ev.originalAiText,
      textoHumano: ev.finalHumanText,
      category: ev.category,
      origenLearningId: ev.id,
      creadoEn: new Date().toISOString(),
    };
    await store.saveEjemplo(ejemplo);
    await store.updateLearningEvent(ev.id, { status: "approved", approvedForTraining: true });
    return { ok: true, ejemplo };
  });

  app.post<{ Params: { id: string } }>("/ai/learning-events/:id/reopen", async (req, reply) => {
    const ev = await store.getLearningEvent(req.params.id);
    if (!ev) return reply.code(404).send({ error: "no encontrado" });
    const actualizado = await store.updateLearningEvent(ev.id, { status: "pending", approvedForTraining: false });
    return { ok: true, learningEvent: actualizado };
  });

  app.get("/ai/reglas", async () => store.listReglas());
  app.get("/ai/ejemplos", async () => store.listEjemplos());

  // ============================================================
  //  IMPORTADOR HISTORICO DE ZENDESK
  // ============================================================

  app.post<{ Body: { filters?: FiltrosImportacion; userId?: string } }>(
    "/zendesk/import-jobs",
    async (req) => {
      const filtros = req.body?.filters ?? {};
      const job = await lanzarImportacion(filtros, req.body?.userId ?? "admin-demo");
      return { ok: true, job };
    },
  );

  app.get("/zendesk/import-jobs", async () => store.listImportJobs());

  app.get<{ Params: { id: string } }>("/zendesk/import-jobs/:id", async (req, reply) => {
    const job = await store.getImportJob(req.params.id);
    if (!job) return reply.code(404).send({ error: "job no encontrado" });
    const tickets = await store.listHistoricalTickets(job.id);
    return { job, tickets };
  });

  app.post<{ Params: { id: string } }>("/zendesk/import-jobs/:id/cancel", async (req, reply) => {
    const job = await store.getImportJob(req.params.id);
    if (!job) return reply.code(404).send({ error: "job no encontrado" });
    if (job.status === "running" || job.status === "pending") {
      await store.updateImportJob(job.id, { status: "cancelled", completedAt: new Date().toISOString() });
    }
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/zendesk/import-jobs/:id/analyze", async (req, reply) => {
    const job = await store.getImportJob(req.params.id);
    if (!job) return reply.code(404).send({ error: "job no encontrado" });
    const r = await analizarJob(job.id);
    return { ok: true, ejemplosCreados: r.creados };
  });

  app.get<{ Params: { ticketId: string } }>("/zendesk/historical-tickets/:ticketId/comments", async (req, reply) => {
    const comments = await store.listHistoricalComments(req.params.ticketId);
    if (!comments.length) return reply.code(404).send({ error: "sin comentarios" });
    return comments;
  });

  // Helper: obtiene set de IDs de agentes de Zendesk (para determinar rol correctamente)
  async function getAgentIds(authHeader: Record<string, string>, zdUrl: (p: string) => string): Promise<Set<string>> {
    const agentIds = new Set<string>();
    let url: string | null = zdUrl("/users.json?role[]=agent&role[]=admin&per_page=100");
    while (url) {
      const res = await fetch(url, { headers: authHeader });
      if (!res.ok) break;
      const page = await res.json() as { users: { id: number }[]; next_page: string | null };
      page.users.forEach(u => agentIds.add(String(u.id)));
      url = page.next_page ?? null;
    }
    return agentIds;
  }

  async function downloadAttachment(
    url: string,
    destPath: string,
    auth: Record<string, string>,
  ): Promise<boolean> {
    try {
      const { createWriteStream, mkdirSync } = await import("fs");
      const { dirname } = await import("path");
      mkdirSync(dirname(destPath), { recursive: true });
      const res = await fetch(url, { headers: auth });
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      const { writeFileSync } = await import("fs");
      writeFileSync(destPath, buf);
      return true;
    } catch { return false; }
  }

  async function fetchAndSaveComments(
    ticketId: string,
    agentIds: Set<string>,
    authHeader: Record<string, string>,
    zdUrl: (p: string) => string,
    nanoid: () => string,
    anonimizar: (s: string) => string,
  ) {
    const rawComments: Record<string, unknown>[] = [];
    let url: string | null = zdUrl(`/tickets/${ticketId}/comments.json?per_page=100&include=attachments`);
    while (url) {
      const res = await fetch(url, { headers: authHeader });
      if (!res.ok) break;
      const page = await res.json() as { comments: Record<string, unknown>[]; next_page: string | null };
      rawComments.push(...page.comments);
      url = page.next_page ?? null;
    }
    await store.deleteHistoricalComments(ticketId);
    const ahora = new Date().toISOString();
    const { join } = await import("path");
    const attachmentsBase = join(process.cwd(), "data", "attachments");

    for (const c of rawComments) {
      const authorId = c.author_id ? String(c.author_id) : null;
      const isAgent = authorId ? agentIds.has(authorId) : false;
      const commentId = String(c.id);

      // Descargar adjuntos
      const rawAttachments = Array.isArray(c.attachments) ? c.attachments as Record<string, unknown>[] : [];
      const attachments = await Promise.all(rawAttachments.map(async a => {
        const attId = String(a.id);
        const fileName = String(a.file_name ?? "adjunto");
        const contentType = String(a.content_type ?? "application/octet-stream");
        const contentUrl = String(a.content_url ?? "");
        const localPath = `${ticketId}/${commentId}_${attId}_${fileName}`;
        const destPath = join(attachmentsBase, localPath);
        const downloaded = contentUrl ? await downloadAttachment(contentUrl, destPath, authHeader) : false;
        return {
          zendeskAttachmentId: attId,
          fileName,
          contentType,
          size: Number(a.size ?? 0),
          localPath: downloaded ? localPath : null,
        };
      }));

      const bodyText = anonimizar(String(c.body ?? ""));
      const { idioma, traduccion } = await detectarYTraducir(bodyText);

      await store.saveHistoricalComment({
        id: nanoid(),
        zendeskCommentId: commentId,
        zendeskTicketId: ticketId,
        authorId,
        authorRole: (isAgent ? "agente" : "cliente") as "cliente" | "agente" | "sistema",
        isPublic: c.public === true,
        messageType: (c.public ? "public_customer_reply" : "internal_note") as "public_customer_reply" | "internal_note",
        bodyText,
        bodyHtml: null,
        attachments,
        detectedLanguage: idioma,
        bodyTextEs: traduccion,
        createdAt: String(c.created_at ?? ahora),
        importedAt: ahora,
      });
    }
    return rawComments.length;
  }

  // Re-fetchea comentarios de un ticket ya importado
  app.post<{ Params: { ticketId: string } }>("/zendesk/historical-tickets/:ticketId/refresh-comments", async (req, reply) => {
    const ticketId = req.params.ticketId;
    const ht = await store.getHistoricalTicketByZendeskId(ticketId);
    if (!ht) return reply.code(404).send({ error: "ticket no importado" });

    const { authHeader, zdUrl } = await import("../zendesk/client.js");
    const { nanoid } = await import("nanoid");
    const { anonimizar } = await import("../zendesk/anonimizar.js");
    const agentIds = await getAgentIds(authHeader(), zdUrl);
    const saved = await fetchAndSaveComments(ticketId, agentIds, authHeader(), zdUrl, nanoid, anonimizar);
    return { ok: true, saved };
  });

  // Helper: guarda comentarios de un ticket padre (no importado) para trazabilidad
  async function fetchAndSaveParentComments(
    parentTicketId: string,
    agentIds: Set<string>,
    auth: Record<string, string>,
    zdUrl: (p: string) => string,
    nanoid: () => string,
    anonimizar: (s: string) => string,
  ): Promise<number> {
    const existing = await store.listHistoricalComments(parentTicketId);
    if (existing.length > 0) return existing.length; // ya los tenemos
    const rawComments: Record<string, unknown>[] = [];
    let url: string | null = zdUrl(`/tickets/${parentTicketId}/comments.json?per_page=100`);
    while (url) {
      const res = await fetch(url, { headers: auth });
      if (!res.ok) break;
      const page = await res.json() as { comments: Record<string, unknown>[]; next_page: string | null };
      rawComments.push(...page.comments);
      url = page.next_page ?? null;
    }
    const ahora = new Date().toISOString();
    for (const c of rawComments) {
      const authorId = c.author_id ? String(c.author_id) : null;
      const bodyText = anonimizar(String(c.body ?? ""));
      const { idioma, traduccion } = await detectarYTraducir(bodyText);
      await store.saveHistoricalComment({
        id: nanoid(),
        zendeskCommentId: String(c.id),
        zendeskTicketId: parentTicketId,
        authorId,
        authorRole: (authorId && agentIds.has(authorId) ? "agente" : "cliente") as "cliente" | "agente" | "sistema",
        isPublic: c.public === true,
        messageType: (c.public ? "public_customer_reply" : "internal_note") as "public_customer_reply" | "internal_note",
        bodyText,
        bodyHtml: null,
        attachments: [],
        detectedLanguage: idioma,
        bodyTextEs: traduccion,
        createdAt: String(c.created_at ?? ahora),
        importedAt: ahora,
      });
    }
    return rawComments.length;
  }

  // Helper: re-fetcha y guarda todos los metadatos de un ticket (via, cliente, org, campos)
  async function enrichTicketMetadata(
    ticketId: string,
    auth: Record<string, string>,
    zdUrl: (p: string) => string,
  ): Promise<Record<string, unknown>> {
    const tr = await fetch(zdUrl(`/tickets/${ticketId}.json`), { headers: auth });
    if (!tr.ok) return {};
    const { ticket: zt } = await tr.json() as { ticket: Record<string, unknown> };
    const via = (zt.via as Record<string, unknown>) ?? {};
    const viaSource = (via.source as Record<string, unknown>) ?? {};
    const viaFrom = (viaSource.from as Record<string, unknown>) ?? {};

    // Campos custom
    const customFields = Array.isArray(zt.custom_fields)
      ? Object.fromEntries((zt.custom_fields as { id: number; value: unknown }[]).map(f => [String(f.id), f.value ?? null]))
      : {};

    // Datos del requester y organización en paralelo
    let requesterName: string | null = null;
    let requesterEmail: string | null = null;
    let requesterPhone: string | null = null;
    let organizationName: string | null = null;
    const [userRes, orgRes] = await Promise.all([
      zt.requester_id ? fetch(zdUrl(`/users/${zt.requester_id}.json`), { headers: auth }) : Promise.resolve(null),
      zt.organization_id ? fetch(zdUrl(`/organizations/${zt.organization_id}.json`), { headers: auth }) : Promise.resolve(null),
    ]);
    if (userRes?.ok) {
      const { user } = await userRes.json() as { user: Record<string, unknown> };
      requesterName  = user.name  ? String(user.name)  : null;
      requesterEmail = user.email ? String(user.email) : null;
      requesterPhone = user.phone ? String(user.phone) : null;
    }
    if (orgRes?.ok) {
      const { organization } = await orgRes.json() as { organization: Record<string, unknown> };
      organizationName = organization.name ? String(organization.name) : null;
    }

    return {
      origenCanal: via.channel ? String(via.channel) : null,
      origenRel: viaSource.rel ? String(viaSource.rel) : null,
      origenTicketId: viaFrom.ticket_id ? String(viaFrom.ticket_id) : null,
      origenTicketTitulo: viaFrom.ticket_title ? String(viaFrom.ticket_title) : null,
      requesterName,
      requesterEmail,
      requesterPhone,
      organizationId: zt.organization_id ? String(zt.organization_id) : null,
      organizationName,
      customFields,
    };
  }

  // Re-fetchea origen/via de un ticket ya importado y descarga hilo del padre si existe
  app.post<{ Params: { ticketId: string } }>("/zendesk/historical-tickets/:ticketId/refresh-origen", async (req, reply) => {
    const ticketId = req.params.ticketId;
    const ht = await store.getHistoricalTicketByZendeskId(ticketId);
    if (!ht) return reply.code(404).send({ error: "ticket no importado" });

    const { authHeader, zdUrl } = await import("../zendesk/client.js");
    const { nanoid } = await import("nanoid");
    const { anonimizar } = await import("../zendesk/anonimizar.js");

    const meta = await enrichTicketMetadata(ticketId, authHeader(), zdUrl);
    if (!Object.keys(meta).length) return reply.code(502).send({ error: "error Zendesk" });

    const comentarios = await store.listHistoricalComments(ticketId);
    const primeraRespuestaEsAgente = comentarios.length > 0 && comentarios[0].authorRole === "agente";

    const cambios = { ...meta, primeraRespuestaEsAgente };
    await store.updateHistoricalTicket(ticketId, cambios);

    // Si hay ticket padre, descargar también su hilo completo
    let parentComments = 0;
    const origenTicketId = meta.origenTicketId as string | null;
    if (origenTicketId) {
      const agentIds = await getAgentIds(authHeader(), zdUrl);
      parentComments = await fetchAndSaveParentComments(origenTicketId, agentIds, authHeader(), zdUrl, nanoid, anonimizar);
    }

    return { ok: true, ...cambios, parentComments };
  });

  // Estado global del proceso de refresh (un solo proceso a la vez)
  let refreshProgress: { total: number; done: number; status: "idle" | "running" | "completed" } = { total: 0, done: 0, status: "idle" };

  app.get("/zendesk/historical-tickets/refresh-all-comments/progress", () => refreshProgress);

  // Puntúa un ticket individual
  app.post<{ Params: { ticketId: string } }>("/zendesk/historical-tickets/:ticketId/score", async (req, reply) => {
    const { ticketId } = req.params;
    const ticket = await store.getHistoricalTicketByZendeskId(ticketId);
    if (!ticket) return reply.code(404).send({ error: "not found" });
    const comments = await store.listHistoricalComments(ticketId);
    const { score, label, razones } = calcularCalidad(ticket, comments);
    await store.updateHistoricalTicket(ticketId, { calidadScore: score, calidadLabel: label, calidadRazones: razones });
    return { ok: true, score, label, razones };
  });

  // Puntúa TODOS los tickets en background
  let scoreProgress: { total: number; done: number; status: "idle" | "running" | "completed" } = { total: 0, done: 0, status: "idle" };
  app.get("/zendesk/historical-tickets/score-all/progress", () => scoreProgress);
  app.post("/zendesk/historical-tickets/score-all", async (_req, reply) => {
    if (scoreProgress.status === "running") return reply.send({ ok: true, alreadyRunning: true });
    const tickets = await store.listAllHistoricalTickets();
    scoreProgress = { total: tickets.length, done: 0, status: "running" };
    reply.send({ ok: true, total: tickets.length });
    (async () => {
      for (const ticket of tickets) {
        const comments = await store.listHistoricalComments(ticket.zendeskTicketId);
        const { score, label, razones } = calcularCalidad(ticket, comments);
        await store.updateHistoricalTicket(ticket.zendeskTicketId, { calidadScore: score, calidadLabel: label, calidadRazones: razones });
        scoreProgress.done++;
      }
      scoreProgress.status = "completed";
    })().catch(console.error);
  });

  // Re-fetchea comentarios de TODOS los tickets importados en background
  app.post("/zendesk/historical-tickets/refresh-all-comments", async (_req, reply) => {
    if (refreshProgress.status === "running") {
      return reply.send({ total: refreshProgress.total, done: refreshProgress.done, status: "running" });
    }
    const { authHeader, zdUrl } = await import("../zendesk/client.js");
    const tickets = await store.listAllHistoricalTickets();
    refreshProgress = { total: tickets.length, done: 0, status: "running" };
    reply.send({ total: tickets.length, done: 0, status: "running" });
    void (async () => {
      const { nanoid } = await import("nanoid");
      const { anonimizar } = await import("../zendesk/anonimizar.js");
      const agentIds = await getAgentIds(authHeader(), zdUrl);
      const CONC = 3;
      for (let i = 0; i < tickets.length; i += CONC) {
        const lote = tickets.slice(i, i + CONC);
        await Promise.allSettled(lote.map(async (ht) => {
          try {
            const ticketId = ht.zendeskTicketId;
            // Re-fetch comentarios con roles correctos
            const n = await fetchAndSaveComments(ticketId, agentIds, authHeader(), zdUrl, nanoid, anonimizar);

            // Re-fetch metadatos completos: via, cliente, org, campos custom
            const meta = await enrichTicketMetadata(ticketId, authHeader(), zdUrl);
            if (Object.keys(meta).length) {
              const comentariosActualizados = await store.listHistoricalComments(ticketId);
              const primeraRespuestaEsAgente = comentariosActualizados.length > 0 && comentariosActualizados[0].authorRole === "agente";
              await store.updateHistoricalTicket(ticketId, { ...meta, primeraRespuestaEsAgente });
              const origenTicketId = meta.origenTicketId as string | null;
              if (origenTicketId) {
                await fetchAndSaveParentComments(origenTicketId, agentIds, authHeader(), zdUrl, nanoid, anonimizar);
              }
            }
            console.log(`[refresh] ticket ${ticketId}: ${n} comentarios`);
          } catch(e) {
            console.error("[refresh] error ticket", ht.zendeskTicketId, e);
          } finally {
            refreshProgress.done++;
          }
        }));
      }
      refreshProgress.status = "completed";
      console.log("[refresh] completado");
    })();
  });

  // Diagnóstico completo de un ticket en Zendesk (auditoría + side convs + ticket data + usuario + campos)
  app.get<{ Params: { ticketId: string } }>("/zendesk/debug-ticket/:ticketId", async (req) => {
    const { ticketId } = req.params;
    const { authHeader, zdUrl } = await import("../zendesk/client.js");
    const h = authHeader();
    const [tRes, audRes, sideRes] = await Promise.all([
      fetch(zdUrl(`/tickets/${ticketId}.json`), { headers: h }),
      fetch(zdUrl(`/tickets/${ticketId}/audits.json`), { headers: h }),
      fetch(zdUrl(`/tickets/${ticketId}/side_conversations.json`), { headers: h }),
    ]);
    const ticket   = tRes.ok   ? await tRes.json()   : null;
    const audits   = audRes.ok ? await audRes.json()  : null;
    const side     = sideRes.ok? await sideRes.json() : null;

    // Fetch user + org + ticket field names
    const zt = (ticket as Record<string, unknown>)?.ticket as Record<string, unknown> | undefined;
    const requesterId = zt?.requester_id;
    const orgId = zt?.organization_id;
    const [userRes, orgRes, fieldsRes] = await Promise.all([
      requesterId ? fetch(zdUrl(`/users/${requesterId}.json`), { headers: h }) : Promise.resolve(null),
      orgId ? fetch(zdUrl(`/organizations/${orgId}.json`), { headers: h }) : Promise.resolve(null),
      fetch(zdUrl(`/ticket_fields.json`), { headers: h }),
    ]);
    const user   = userRes?.ok   ? await userRes.json()   : null;
    const org    = orgRes?.ok    ? await orgRes.json()    : null;
    const fields = fieldsRes?.ok ? await fieldsRes.json() : null;

    return { ticket, audits, side, user, org, fields };
  });

  // Info de origen (via/trazabilidad) de múltiples tickets: ?ids=X,Y,Z
  app.get<{ Querystring: { ids: string } }>("/zendesk/historical-tickets/origen-batch", async (req) => {
    const ids = (req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean);
    const result: Record<string, unknown> = {};
    await Promise.all(ids.map(async id => {
      const ht = await store.getHistoricalTicketByZendeskId(id);
      if (ht) result[id] = {
        origenCanal: ht.origenCanal ?? null,
        origenRel: ht.origenRel ?? null,
        origenTicketId: ht.origenTicketId ?? null,
        origenTicketTitulo: ht.origenTicketTitulo ?? null,
        primeraRespuestaEsAgente: ht.primeraRespuestaEsAgente ?? false,
        // Datos del cliente
        requesterName: ht.requesterName ?? null,
        requesterEmail: ht.requesterEmail ?? null,
        requesterPhone: ht.requesterPhone ?? null,
        organizationName: ht.organizationName ?? null,
        // Campos custom clave
        customFields: ht.customFields ?? {},
        // Calidad
        calidadScore: ht.calidadScore ?? null,
        calidadLabel: ht.calidadLabel ?? null,
        calidadRazones: ht.calidadRazones ?? null,
      };
    }));
    return result;
  });

  // Proxy para imágenes inline de Zendesk (necesitan auth, el navegador no puede enviarla)
  app.get<{ Querystring: { url: string } }>("/zendesk/attachment-proxy", async (req, reply) => {
    const { url } = req.query;
    if (!url || !url.startsWith("https://")) return reply.code(400).send("bad url");
    const { authHeader: ah } = await import("../zendesk/client.js");
    const res = await fetch(url, { headers: ah() });
    if (!res.ok) return reply.code(res.status).send("upstream error");
    const ct = res.headers.get("content-type") ?? "application/octet-stream";
    reply.header("Content-Type", ct);
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(Buffer.from(await res.arrayBuffer()));
  });

  // Sirve adjuntos descargados localmente
  app.get<{ Params: { "*": string } }>("/attachments/*", async (req, reply) => {
    const { join } = await import("path");
    const { createReadStream, existsSync, statSync } = await import("fs");
    const relPath = (req.params as Record<string, string>)["*"];
    if (!relPath || relPath.includes("..")) return reply.code(400).send("bad path");
    const filePath = join(process.cwd(), "data", "attachments", relPath);
    if (!existsSync(filePath)) return reply.code(404).send("not found");
    const ext = relPath.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      webp: "image/webp", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword", zip: "application/zip",
    };
    const contentType = mimeMap[ext] ?? "application/octet-stream";
    const fileName = relPath.split("/").pop() ?? "file";
    reply.header("Content-Type", contentType);
    reply.header("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    reply.header("Content-Length", statSync(filePath).size);
    reply.header("Cache-Control", "public, max-age=31536000");
    return reply.send(createReadStream(filePath));
  });

  // Comentarios de múltiples tickets a la vez: ?ids=X,Y,Z
  app.get<{ Querystring: { ids: string } }>("/zendesk/historical-comments/batch", async (req) => {
    const ids = (req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean);
    const result: Record<string, unknown[]> = {};
    await Promise.all(ids.map(async id => {
      result[id] = await store.listHistoricalComments(id);
    }));
    return result;
  });

  // --- Ejemplos de entrenamiento ---
  app.get("/ai/training-examples", async () => store.listTrainingExamples());

  app.post<{ Params: { id: string } }>("/ai/training-examples/:id/approve", async (req, reply) => {
    const e = await store.getTrainingExample(req.params.id);
    if (!e) return reply.code(404).send({ error: "no encontrado" });
    const x = await store.updateTrainingExample(e.id, { status: "aprobado", approvedForTraining: true });
    return { ok: true, ejemplo: x };
  });

  app.post<{ Params: { id: string } }>("/ai/training-examples/:id/reject", async (req, reply) => {
    const e = await store.getTrainingExample(req.params.id);
    if (!e) return reply.code(404).send({ error: "no encontrado" });
    const x = await store.updateTrainingExample(e.id, { status: "rechazado", approvedForTraining: false });
    return { ok: true, ejemplo: x };
  });

  app.post<{ Params: { id: string }; Body: { texto?: string } }>(
    "/ai/training-examples/:id/edit",
    async (req, reply) => {
      const e = await store.getTrainingExample(req.params.id);
      if (!e) return reply.code(404).send({ error: "no encontrado" });
      const x = await store.updateTrainingExample(e.id, {
        humanResponse: req.body?.texto ?? e.humanResponse,
        status: "necesita_edicion",
      });
      return { ok: true, ejemplo: x };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/ai/training-examples/:id/convert-to-rule",
    async (req, reply) => {
      const e = await store.getTrainingExample(req.params.id);
      if (!e) return reply.code(404).send({ error: "no encontrado" });
      const ahora = new Date().toISOString();
      const doc: DocumentoKB = {
        id: nanoid(),
        titulo: `Regla aprendida: ${e.reglaPropuesta.slice(0, 80)}`,
        descripcion: "Regla aprendida de un ejemplo de entrenamiento aprobado.",
        tipo: "caso_aprendido",
        dominio: "CASOS_APRENDIDOS",
        categoria: e.category ? "Sin clasificar" : "Sin clasificar",
        subcategoria: null,
        nivelAcceso: "interno",
        usadoPor: ["chatbox_doccia_clientes", "zendesk_ai"],
        prioridad: "medium",
        texto: `REGLA APRENDIDA\n\n${e.reglaPropuesta}\n\nContexto original:\n${e.contextSummary}\n\nRespuesta de referencia:\n${e.humanResponse}`,
        status: "pending_review",
        tags: ["aprendido", "regla"],
        fuente: `training_example:${e.id}`,
        version: "1.0",
        creadoEn: ahora,
        actualizadoEn: ahora,
      };
      await store.addKb(doc);
      await store.updateTrainingExample(e.id, { status: "aprobado", approvedForTraining: true });
      return { ok: true, docKbId: doc.id };
    },
  );

  app.post<{ Params: { id: string } }>("/ai/training-examples/:id/reset", async (req, reply) => {
    const e = await store.getTrainingExample(req.params.id);
    if (!e) return reply.code(404).send({ error: "no encontrado" });
    const x = await store.updateTrainingExample(e.id, { status: "pendiente", approvedForTraining: false });
    return { ok: true, ejemplo: x };
  });

  // --- Dashboard ---
  app.get("/api/stats", async () => {
    const borradores = await store.listBorradores();
    const total = borradores.length;
    const por = (estado: string) => borradores.filter((b) => b.estado === estado).length;
    const aprobados = por("aprobado");
    const editados = por("editado");
    const rechazados = por("rechazado");
    const escalados = por("escalado");
    const pendientes = por("pendiente");

    const correcciones = await store.listCorrecciones();
    const MIN_AHORRADOS_POR_RESPUESTA = 6; // estimacion
    const tiempoAhorradoMin = (aprobados + editados) * MIN_AHORRADOS_POR_RESPUESTA;

    return {
      total,
      pendientes,
      aprobados,
      editados,
      rechazados,
      escalados,
      tasaAprobacion: total ? aprobados / total : 0,
      tasaModificacion: total ? editados / total : 0,
      tasaRechazo: total ? rechazados / total : 0,
      tiempoAhorradoMin,
      correcciones: correcciones.length,
    };
  });

  // ============================================================
  //  CONFIGURACIÓN DEL SISTEMA
  // ============================================================

  app.get("/settings", async () => {
    return store.listSettings();
  });

  app.get<{ Params: { key: string } }>("/settings/:key", async (req, reply) => {
    const s = await store.getSetting(req.params.key);
    if (!s) return reply.code(404).send({ error: "Setting no encontrado" });
    return s;
  });

  app.patch<{ Params: { key: string }; Body: { value: string; updatedBy?: string } }>(
    "/settings/:key",
    async (req, reply) => {
      const { value, updatedBy } = req.body;
      if (value === undefined) return reply.code(400).send({ error: "value requerido" });
      const s = await store.setSetting(req.params.key, String(value), updatedBy ?? "panel");
      return s;
    },
  );

  app.post<{ Body: { key: string; value: string; description?: string; updatedBy?: string } }>(
    "/settings",
    async (req, reply) => {
      const { key, value, description, updatedBy } = req.body;
      if (!key || value === undefined) return reply.code(400).send({ error: "key y value requeridos" });
      const s = await store.setSetting(key, String(value), updatedBy ?? "panel", description);
      return s;
    },
  );

  // ============================================================
  //  DOMINIOS DE CONOCIMIENTO
  // ============================================================

  app.get("/knowledge/domains", async () => store.listDomains());

  app.get<{ Params: { id: string } }>("/knowledge/domains/:id", async (req, reply) => {
    const d = await store.getDomain(req.params.id);
    if (!d) return reply.code(404).send({ error: "Dominio no encontrado" });
    return d;
  });

  app.post<{ Body: Partial<KnowledgeDomain> }>("/knowledge/domains", async (req, reply) => {
    const { code, name, description } = req.body;
    if (!code || !name) return reply.code(400).send({ error: "code y name requeridos" });
    const now = new Date().toISOString();
    const domain: KnowledgeDomain = {
      id: nanoid(),
      code: code as KnowledgeDomain["code"],
      name,
      description: description ?? "",
      isActive: true,
      creadoEn: now,
      actualizadoEn: now,
    };
    await store.upsertDomain(domain);
    return { ok: true, domain };
  });

  app.patch<{ Params: { id: string }; Body: Partial<KnowledgeDomain> }>(
    "/knowledge/domains/:id",
    async (req, reply) => {
      const existing = await store.getDomain(req.params.id);
      if (!existing) return reply.code(404).send({ error: "Dominio no encontrado" });
      const updated: KnowledgeDomain = {
        ...existing,
        ...req.body,
        id: existing.id,
        actualizadoEn: new Date().toISOString(),
      };
      await store.upsertDomain(updated);
      return { ok: true, domain: updated };
    },
  );

  // ============================================================
  //  CHATBOXES
  // ============================================================

  app.get("/chatboxes", async () => store.listChatboxes());

  app.get<{ Params: { id: string } }>("/chatboxes/:id", async (req, reply) => {
    const c = await store.getChatbox(req.params.id);
    if (!c) return reply.code(404).send({ error: "Chatbox no encontrado" });
    return c;
  });

  app.patch<{ Params: { id: string }; Body: { isActive?: boolean; defaultModel?: string; name?: string; description?: string } }>(
    "/chatboxes/:id",
    async (req, reply) => {
      const existing = await store.getChatbox(req.params.id);
      if (!existing) return reply.code(404).send({ error: "Chatbox no encontrado" });
      const updated = { ...existing, ...req.body, id: existing.id, actualizadoEn: new Date().toISOString() };
      await store.upsertChatbox(updated);
      return { ok: true, chatbox: updated };
    },
  );

  // ============================================================
  //  PERMISOS CHATBOX × DOMINIO
  // ============================================================

  app.get<{ Params: { id: string } }>("/chatboxes/:id/permissions", async (req, reply) => {
    const cb = await store.getChatbox(req.params.id);
    if (!cb) return reply.code(404).send({ error: "Chatbox no encontrado" });
    const perms = await store.listPermissions(req.params.id);
    const domains = await store.listDomains();
    const domainMap = Object.fromEntries(domains.map((d) => [d.id, d]));
    return perms.map((p) => ({ ...p, domain: domainMap[p.domainId] ?? null }));
  });

  app.post<{ Params: { id: string }; Body: Partial<ChatboxDomainPermission> }>(
    "/chatboxes/:id/permissions",
    async (req, reply) => {
      const cb = await store.getChatbox(req.params.id);
      if (!cb) return reply.code(404).send({ error: "Chatbox no encontrado" });
      const { domainId, accessLevel, canRead, canWrite, canTrain } = req.body;
      if (!domainId) return reply.code(400).send({ error: "domainId requerido" });
      // check if permission already exists for this chatbox/domain
      const existing = (await store.listPermissions(req.params.id)).find((p) => p.domainId === domainId);
      const perm: ChatboxDomainPermission = {
        id: existing?.id ?? nanoid(),
        chatboxId: req.params.id,
        domainId,
        accessLevel: accessLevel ?? (canRead && canWrite ? "full" : canRead ? "read_only" : "none"),
        canRead: canRead ?? true,
        canWrite: canWrite ?? false,
        canTrain: canTrain ?? false,
        creadoEn: existing?.creadoEn ?? new Date().toISOString(),
      };
      await store.upsertPermission(perm);
      return { ok: true, perm };
    },
  );

  app.delete<{ Params: { id: string; permId: string } }>(
    "/chatboxes/:id/permissions/:permId",
    async (req, reply) => {
      await store.deletePermission(req.params.permId);
      return { ok: true };
    },
  );

  // ============================================================
  //  EVENTOS OMITIDOS
  // ============================================================

  app.get<{ Querystring: { limit?: string } }>("/zendesk/skipped-events", async (req) => {
    const limit = Number(req.query.limit ?? 100);
    return store.listSkippedEvents(limit);
  });

  // ============================================================
  //  REVISIÓN DE TICKETS
  // ============================================================

  app.get<{ Querystring: { reviewStatus?: string; aiCategory?: string } }>(
    "/zendesk/ticket-reviews",
    async (req) => {
      return store.listTicketReviews({
        reviewStatus: req.query.reviewStatus,
        aiCategory: req.query.aiCategory,
      });
    },
  );

  app.get<{ Params: { id: string } }>("/zendesk/ticket-reviews/:id", async (req, reply) => {
    const r = await store.getTicketReview(req.params.id);
    if (!r) return reply.code(404).send({ error: "Review no encontrado" });
    return r;
  });

  app.post<{ Params: { id: string }; Body: { reviewedBy?: string } }>(
    "/zendesk/ticket-reviews/:id/mark-reviewed",
    async (req, reply) => {
      const r = await store.getTicketReview(req.params.id);
      if (!r) return reply.code(404).send({ error: "Review no encontrado" });
      const updated = await store.updateTicketReview(r.id, {
        reviewStatus: "revisado",
        reviewedBy: req.body.reviewedBy ?? "panel",
        reviewedAt: new Date().toISOString(),
      });
      return { ok: true, review: updated };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { correctedCategory: CategoriaIA; correctedSubcategory?: string; correctionReason?: string; correctedBy?: string };
  }>("/zendesk/ticket-reviews/:id/correct-classification", async (req, reply) => {
    const r = await store.getTicketReview(req.params.id);
    if (!r) return reply.code(404).send({ error: "Review no encontrado" });
    const { correctedCategory, correctedSubcategory, correctionReason, correctedBy } = req.body;
    if (!correctedCategory) return reply.code(400).send({ error: "correctedCategory requerido" });
    const correction: TicketClassificationCorrection = {
      id: nanoid(),
      zendeskTicketId: r.zendeskTicketId,
      originalAiCategory: r.aiCategory,
      correctedCategory,
      originalAiSubcategory: r.aiSubcategory,
      correctedSubcategory: correctedSubcategory ?? null,
      correctionReason: correctionReason ?? null,
      correctedBy: correctedBy ?? "panel",
      creadoEn: new Date().toISOString(),
    };
    await store.saveClassificationCorrection(correction);
    await store.updateTicketReview(r.id, {
      aiCategory: correctedCategory,
      aiSubcategory: correctedSubcategory ?? r.aiSubcategory,
      reviewStatus: "revisado",
      reviewedBy: correctedBy ?? "panel",
      reviewedAt: new Date().toISOString(),
    });
    return { ok: true, correction };
  });

  app.post<{ Params: { id: string }; Body: { reviewedBy?: string } }>(
    "/zendesk/ticket-reviews/:id/approve-learning",
    async (req, reply) => {
      const r = await store.getTicketReview(req.params.id);
      if (!r) return reply.code(404).send({ error: "Review no encontrado" });
      const updated = await store.updateTicketReview(r.id, {
        reviewStatus: "aprobado_para_aprendizaje",
        reviewedBy: req.body.reviewedBy ?? "panel",
        reviewedAt: new Date().toISOString(),
      });
      return { ok: true, review: updated };
    },
  );

  app.post<{ Params: { id: string }; Body: { reviewedBy?: string } }>(
    "/zendesk/ticket-reviews/:id/ignore",
    async (req, reply) => {
      const r = await store.getTicketReview(req.params.id);
      if (!r) return reply.code(404).send({ error: "Review no encontrado" });
      const updated = await store.updateTicketReview(r.id, {
        reviewStatus: "ignorado",
        reviewedBy: req.body.reviewedBy ?? "panel",
        reviewedAt: new Date().toISOString(),
      });
      return { ok: true, review: updated };
    },
  );

  // Cargar conversación desde Zendesk y guardarla en el review
  app.post<{ Params: { id: string } }>(
    "/zendesk/ticket-reviews/:id/fetch-conversation",
    async (req, reply) => {
      const r = await store.getTicketReview(req.params.id);
      if (!r) return reply.code(404).send({ error: "Review no encontrado" });
      const { obtenerTicketZendesk } = await import("../zendesk/client.js");
      const datos = await obtenerTicketZendesk(r.zendeskTicketId);
      if (!datos) return reply.code(503).send({ error: "No se pudo obtener el ticket de Zendesk" });
      const mensajesTexto = datos.mensajes.map((m) => ({ autor: m.autor, texto: m.texto, isPublic: true }));
      const updated = await store.updateTicketReview(r.id, {
        mensajesTexto,
        actualizadoEn: new Date().toISOString(),
      });
      return { ok: true, review: updated };
    },
  );

  // Cargar conversaciones de todos los reviews sin mensajes (proceso en background)
  app.post("/zendesk/ticket-reviews/fetch-all-conversations", async (_req, reply) => {
    const { obtenerTicketZendesk } = await import("../zendesk/client.js");
    const todos = await store.listTicketReviews();
    const sinMensajes = todos.filter(r => !r.mensajesTexto || r.mensajesTexto.length === 0);
    reply.send({ total: sinMensajes.length, status: "running" });
    // Procesa en background con concurrencia de 3
    void (async () => {
      const CONC = 3;
      for (let i = 0; i < sinMensajes.length; i += CONC) {
        const lote = sinMensajes.slice(i, i + CONC);
        await Promise.allSettled(lote.map(async (r) => {
          try {
            const datos = await obtenerTicketZendesk(r.zendeskTicketId);
            if (!datos) return;
            const mensajesTexto = datos.mensajes.map((m) => ({ autor: m.autor, texto: m.texto, isPublic: true }));
            await store.updateTicketReview(r.id, { mensajesTexto, actualizadoEn: new Date().toISOString() });
          } catch (e) {
            console.error("[fetch-all-conv] error ticket", r.zendeskTicketId, e);
          }
        }));
      }
      console.log(`[fetch-all-conv] completado: ${sinMensajes.length} reviews procesados`);
    })();
  });

  // Guardar texto de borrador editado manualmente en el review (persiste sin necesitar IA)
  app.post<{ Params: { id: string }; Body: { texto: string } }>(
    "/zendesk/ticket-reviews/:id/save-draft",
    async (req, reply) => {
      const r = await store.getTicketReview(req.params.id);
      if (!r) return reply.code(404).send({ error: "Review no encontrado" });
      const updated = await store.updateTicketReview(r.id, {
        aiDraftText: req.body.texto ?? "",
        actualizadoEn: new Date().toISOString(),
      });
      return { ok: true, review: updated };
    },
  );

  // Devuelve todos los grupos de Zendesk con nombre
  app.get("/zendesk/groups", async () => {
    const { authHeader, zdUrl } = await import("../zendesk/client.js");
    const res = await fetch(zdUrl("/groups.json"), { headers: authHeader() });
    if (!res.ok) return [];
    const { groups } = await res.json() as { groups: { id: number; name: string }[] };
    return groups.map(g => ({ id: String(g.id), name: g.name }));
  });

  // Resuelve IDs de agentes a nombres consultando Zendesk
  app.get("/zendesk/agents", async () => {
    const { authHeader, zdUrl } = await import("../zendesk/client.js");
    const reviews = await store.listTicketReviews();
    const ids = [...new Set(reviews.map(r => r.assigneeId).filter(Boolean))] as string[];
    if (!ids.length) return [];
    const res = await fetch(zdUrl(`/users/show_many.json?ids=${ids.join(",")}`), { headers: authHeader() });
    if (!res.ok) return [];
    const { users } = await res.json() as { users: { id: number; name: string }[] };
    return users.map(u => ({ id: String(u.id), name: u.name }));
  });

  // Sincroniza todos los reviews con Zendesk para rellenar campos vacíos
  app.post("/zendesk/ticket-reviews/sync-all", async () => {
    const { obtenerTicketZendesk } = await import("../zendesk/client.js");
    const reviews = await store.listTicketReviews();
    let ok = 0, err = 0;
    for (const rev of reviews) {
      try {
        const zd = await obtenerTicketZendesk(rev.zendeskTicketId);
        if (!zd) { err++; continue; }
        await store.updateTicketReview(rev.id, {
          assigneeId: zd.assigneeId,
          groupId: zd.groupId,
          requesterId: zd.requesterId,
          organizationId: zd.organizationId,
          channel: zd.canalEntrada,
          inboundEmail: zd.emailEntrada,
          zendeskStatus: zd.estado,
          zendeskPriority: zd.prioridad,
          zendeskTagsJson: zd.etiquetas,
          zendeskFormId: zd.formId,
          departamento: zd.departamento,
          submotivo: zd.submotivo,
        });
        ok++;
      } catch { err++; }
    }
    return { ok, err, total: reviews.length };
  });

  app.get<{ Params: { id: string } }>(
    "/zendesk/ticket-reviews/:id/corrections",
    async (req, reply) => {
      const r = await store.getTicketReview(req.params.id);
      if (!r) return reply.code(404).send({ error: "Review no encontrado" });
      return store.listClassificationCorrections(r.zendeskTicketId);
    },
  );
}
