import { nanoid } from "nanoid";
import type { Store } from "./store.js";
import type {
  AiLearningEvent,
  AiSuggestion,
  Analisis,
  Borrador,
  Chatbox,
  ChatboxDomainPermission,
  Correccion,
  DocumentoKB,
  EjemploEntrenamiento,
  EventoSeguridad,
  HistoricalComment,
  HistoricalSideConversation,
  HistoricalTicket,
  ImportJob,
  KnowledgeDomain,
  Mensaje,
  ReglaAprendida,
  SystemSetting,
  Ticket,
  TicketClassificationCorrection,
  TrainingExample,
  ZendeskFinalMessage,
  ZendeskSkippedEvent,
  ZendeskTicketReview,
} from "../types.js";

/**
 * Implementacion FALSA (de mentira) en memoria. Sirve para desarrollar y probar
 * el panel y el pipeline sin ninguna BD ni Zendesk. Los datos se pierden al
 * reiniciar el proceso (es lo esperado en esta fase).
 */
export class MockStore implements Store {
  protected tickets = new Map<string, Ticket>();
  protected mensajes = new Map<string, Mensaje[]>();
  protected analisis = new Map<string, Analisis>();
  protected borradores = new Map<string, Borrador>();
  protected correcciones: Correccion[] = [];
  protected kb = new Map<string, DocumentoKB>();
  protected eventos: EventoSeguridad[] = [];
  protected suggestions = new Map<string, AiSuggestion>();
  protected finalMessages: ZendeskFinalMessage[] = [];
  protected learningEvents = new Map<string, AiLearningEvent>();
  protected reglas: ReglaAprendida[] = [];
  protected ejemplos: EjemploEntrenamiento[] = [];
  protected importJobs = new Map<string, ImportJob>();
  protected histTickets: HistoricalTicket[] = [];
  protected histComments: HistoricalComment[] = [];
  protected histSideConvs: HistoricalSideConversation[] = [];
  protected trainingExamples = new Map<string, TrainingExample>();
  protected domains = new Map<string, KnowledgeDomain>();
  protected chatboxes = new Map<string, Chatbox>();
  protected permissions = new Map<string, ChatboxDomainPermission>();
  protected settings = new Map<string, SystemSetting>();
  protected skippedEvents: ZendeskSkippedEvent[] = [];
  protected ticketReviews = new Map<string, ZendeskTicketReview>();
  protected classificationCorrections: TicketClassificationCorrection[] = [];

  async listTickets(): Promise<Ticket[]> {
    return [...this.tickets.values()].sort((a, b) =>
      b.creadoEn.localeCompare(a.creadoEn),
    );
  }
  async getTicket(id: string) {
    return this.tickets.get(id) ?? null;
  }
  async upsertTicket(ticket: Ticket) {
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  async getMensajes(ticketId: string) {
    return this.mensajes.get(ticketId) ?? [];
  }
  async addMensaje(mensaje: Mensaje) {
    const lista = this.mensajes.get(mensaje.ticketId) ?? [];
    lista.push(mensaje);
    this.mensajes.set(mensaje.ticketId, lista);
    return mensaje;
  }

  async saveAnalisis(analisis: Analisis) {
    this.analisis.set(analisis.id, analisis);
    return analisis;
  }
  async getAnalisis(id: string) {
    return this.analisis.get(id) ?? null;
  }

  async saveBorrador(borrador: Borrador) {
    this.borradores.set(borrador.id, borrador);
    return borrador;
  }
  async getBorrador(id: string) {
    return this.borradores.get(id) ?? null;
  }
  async getBorradorPorTicket(ticketId: string) {
    const lista = [...this.borradores.values()]
      .filter((b) => b.ticketId === ticketId)
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
    return lista[0] ?? null;
  }
  async updateBorrador(id: string, cambios: Partial<Borrador>) {
    const actual = this.borradores.get(id);
    if (!actual) throw new Error(`Borrador no encontrado: ${id}`);
    const nuevo = { ...actual, ...cambios };
    this.borradores.set(id, nuevo);
    return nuevo;
  }
  async listBorradores(estado?: string) {
    let lista = [...this.borradores.values()];
    if (estado) lista = lista.filter((b) => b.estado === estado);
    return lista.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }

  async saveCorreccion(correccion: Correccion) {
    this.correcciones.push(correccion);
    return correccion;
  }
  async listCorrecciones() {
    return [...this.correcciones];
  }

  async listKb() {
    return [...this.kb.values()];
  }
  async addKb(doc: DocumentoKB) {
    this.kb.set(doc.id, doc);
    return doc;
  }
  async updateKb(id: string, cambios: Partial<DocumentoKB>) {
    const doc = this.kb.get(id);
    if (!doc) return null;
    const actualizado = { ...doc, ...cambios };
    this.kb.set(id, actualizado);
    return actualizado;
  }
  async deleteKb(id: string) {
    this.kb.delete(id);
  }

  async saveEventoSeguridad(evento: EventoSeguridad) {
    this.eventos.push(evento);
    return evento;
  }
  async listEventosSeguridad() {
    return [...this.eventos];
  }

  // --- Aprendizaje por correccion humana ---
  async saveSuggestion(s: AiSuggestion) {
    this.suggestions.set(s.id, s);
    return s;
  }
  async getSuggestion(id: string) {
    return this.suggestions.get(id) ?? null;
  }
  async updateSuggestion(id: string, cambios: Partial<AiSuggestion>) {
    const actual = this.suggestions.get(id);
    if (!actual) throw new Error(`Suggestion no encontrada: ${id}`);
    const nuevo = { ...actual, ...cambios };
    this.suggestions.set(id, nuevo);
    return nuevo;
  }
  async listSuggestions() {
    return [...this.suggestions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getSuggestionPendiente(ticketId: string) {
    return (
      [...this.suggestions.values()]
        .filter((s) => s.ticketId === ticketId && s.status === "pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    );
  }

  async saveFinalMessage(m: ZendeskFinalMessage) {
    this.finalMessages.push(m);
    return m;
  }
  async listFinalMessages() {
    return [...this.finalMessages];
  }
  async eventoYaProcesado(sourceEventId: string) {
    return this.finalMessages.some((m) => m.sourceEventId === sourceEventId);
  }

  async saveLearningEvent(e: AiLearningEvent) {
    this.learningEvents.set(e.id, e);
    return e;
  }
  async getLearningEvent(id: string) {
    return this.learningEvents.get(id) ?? null;
  }
  async updateLearningEvent(id: string, cambios: Partial<AiLearningEvent>) {
    const actual = this.learningEvents.get(id);
    if (!actual) throw new Error(`LearningEvent no encontrado: ${id}`);
    const nuevo = { ...actual, ...cambios };
    this.learningEvents.set(id, nuevo);
    return nuevo;
  }
  async listLearningEvents() {
    return [...this.learningEvents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveRegla(r: ReglaAprendida) {
    this.reglas.push(r);
    return r;
  }
  async listReglas() {
    return [...this.reglas];
  }
  async saveEjemplo(e: EjemploEntrenamiento) {
    this.ejemplos.push(e);
    return e;
  }
  async listEjemplos() {
    return [...this.ejemplos];
  }

  // --- Importador historico ---
  async saveImportJob(j: ImportJob) {
    this.importJobs.set(j.id, j);
    return j;
  }
  async getImportJob(id: string) {
    return this.importJobs.get(id) ?? null;
  }
  async updateImportJob(id: string, cambios: Partial<ImportJob>) {
    const actual = this.importJobs.get(id);
    if (!actual) throw new Error(`ImportJob no encontrado: ${id}`);
    const nuevo = { ...actual, ...cambios };
    this.importJobs.set(id, nuevo);
    return nuevo;
  }
  async listImportJobs() {
    return [...this.importJobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async saveHistoricalTicket(t: HistoricalTicket) {
    this.histTickets.push(t);
    return t;
  }
  async updateHistoricalTicket(zendeskTicketId: string, cambios: Partial<HistoricalTicket>) {
    const idx = this.histTickets.findIndex(t => t.zendeskTicketId === zendeskTicketId);
    if (idx !== -1) Object.assign(this.histTickets[idx], cambios);
  }
  async listHistoricalTickets(jobId?: string) {
    return jobId ? this.histTickets.filter((t) => t.jobId === jobId) : [...this.histTickets];
  }
  async listAllHistoricalTickets() { return [...this.histTickets]; }
  async getHistoricalTicketByZendeskId(zendeskTicketId: string) {
    return this.histTickets.find((t) => t.zendeskTicketId === zendeskTicketId) ?? null;
  }
  async existeHistoricalTicket(zendeskTicketId: string) {
    return this.histTickets.some((t) => t.zendeskTicketId === zendeskTicketId);
  }
  async saveHistoricalComment(c: HistoricalComment) {
    this.histComments.push(c);
    return c;
  }
  async listHistoricalComments(zendeskTicketId: string) {
    return this.histComments.filter((c) => c.zendeskTicketId === zendeskTicketId);
  }
  async deleteHistoricalComments(zendeskTicketId: string) {
    this.histComments = (this.histComments as HistoricalComment[]).filter((c) => c.zendeskTicketId !== zendeskTicketId);
  }
  async saveHistoricalSideConversation(s: HistoricalSideConversation) {
    this.histSideConvs.push(s);
    return s;
  }

  async saveTrainingExample(e: TrainingExample) {
    this.trainingExamples.set(e.id, e);
    return e;
  }
  async getTrainingExample(id: string) {
    return this.trainingExamples.get(id) ?? null;
  }
  async updateTrainingExample(id: string, cambios: Partial<TrainingExample>) {
    const actual = this.trainingExamples.get(id);
    if (!actual) throw new Error(`TrainingExample no encontrado: ${id}`);
    const nuevo = { ...actual, ...cambios };
    this.trainingExamples.set(id, nuevo);
    return nuevo;
  }
  async listTrainingExamples() {
    return [...this.trainingExamples.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- Dominios de conocimiento ---
  async listDomains() {
    return [...this.domains.values()].sort((a, b) => a.code.localeCompare(b.code));
  }
  async getDomain(id: string) {
    return this.domains.get(id) ?? null;
  }
  async upsertDomain(domain: KnowledgeDomain) {
    this.domains.set(domain.id, domain);
    return domain;
  }

  // --- Chatboxes ---
  async listChatboxes() {
    return [...this.chatboxes.values()].sort((a, b) => a.code.localeCompare(b.code));
  }
  async getChatbox(id: string) {
    return this.chatboxes.get(id) ?? null;
  }
  async upsertChatbox(chatbox: Chatbox) {
    this.chatboxes.set(chatbox.id, chatbox);
    return chatbox;
  }

  // --- Permisos chatbox × dominio ---
  async listPermissions(chatboxId?: string) {
    const all = [...this.permissions.values()];
    return chatboxId ? all.filter((p) => p.chatboxId === chatboxId) : all;
  }
  async upsertPermission(perm: ChatboxDomainPermission) {
    this.permissions.set(perm.id, perm);
    return perm;
  }
  async deletePermission(id: string) {
    this.permissions.delete(id);
  }

  // --- Configuración del sistema ---
  async listSettings() {
    return [...this.settings.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
  async getSetting(key: string) {
    return [...this.settings.values()].find((s) => s.key === key) ?? null;
  }
  async setSetting(key: string, value: string, updatedBy = "system", description?: string) {
    const existing = await this.getSetting(key);
    const now = new Date().toISOString();
    const setting: SystemSetting = {
      id: existing?.id ?? nanoid(),
      key,
      value,
      description: description ?? existing?.description ?? "",
      updatedBy,
      updatedAt: now,
    };
    this.settings.set(setting.id, setting);
    return setting;
  }

  // --- Eventos omitidos ---
  async logSkippedEvent(event: Omit<ZendeskSkippedEvent, "id" | "creadoEn">) {
    const e: ZendeskSkippedEvent = { ...event, id: nanoid(), creadoEn: new Date().toISOString() };
    this.skippedEvents.unshift(e);
    return e;
  }
  async listSkippedEvents(limit = 200) {
    return this.skippedEvents.slice(0, limit);
  }

  // --- Revisión de tickets ---
  async saveTicketReview(r: ZendeskTicketReview) {
    this.ticketReviews.set(r.id, r);
    return r;
  }
  async getTicketReview(id: string) {
    return this.ticketReviews.get(id) ?? null;
  }
  async getTicketReviewByZendeskId(zendeskTicketId: string) {
    return [...this.ticketReviews.values()].find((r) => r.zendeskTicketId === zendeskTicketId) ?? null;
  }
  async updateTicketReview(id: string, cambios: Partial<ZendeskTicketReview>) {
    const actual = this.ticketReviews.get(id);
    if (!actual) throw new Error(`TicketReview no encontrado: ${id}`);
    const nuevo = { ...actual, ...cambios, actualizadoEn: new Date().toISOString() };
    this.ticketReviews.set(id, nuevo);
    return nuevo;
  }
  async listTicketReviews(filtro?: { reviewStatus?: string; aiCategory?: string }) {
    let lista = [...this.ticketReviews.values()];
    if (filtro?.reviewStatus) lista = lista.filter((r) => r.reviewStatus === filtro.reviewStatus);
    if (filtro?.aiCategory) lista = lista.filter((r) => r.aiCategory === filtro.aiCategory);
    return lista.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }

  // --- Correcciones de clasificación ---
  async saveClassificationCorrection(c: TicketClassificationCorrection) {
    this.classificationCorrections.push(c);
    return c;
  }
  async listClassificationCorrections(zendeskTicketId?: string) {
    return zendeskTicketId
      ? this.classificationCorrections.filter((c) => c.zendeskTicketId === zendeskTicketId)
      : [...this.classificationCorrections];
  }
}
