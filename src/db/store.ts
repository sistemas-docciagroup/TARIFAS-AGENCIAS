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
 * Interfaz unica de persistencia. TODO el codigo de la app habla solo con esto.
 * Hoy la implementa `MockStore` (en memoria). El dia que conectemos una BD real,
 * creamos otra implementacion y cambiamos una sola linea en `db/index.ts`.
 */
export interface Store {
  // Tickets
  listTickets(filtro?: { estadoBorrador?: string }): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | null>;
  upsertTicket(ticket: Ticket): Promise<Ticket>;

  // Mensajes
  getMensajes(ticketId: string): Promise<Mensaje[]>;
  addMensaje(mensaje: Mensaje): Promise<Mensaje>;

  // Analisis
  saveAnalisis(analisis: Analisis): Promise<Analisis>;
  getAnalisis(id: string): Promise<Analisis | null>;

  // Borradores
  saveBorrador(borrador: Borrador): Promise<Borrador>;
  getBorrador(id: string): Promise<Borrador | null>;
  getBorradorPorTicket(ticketId: string): Promise<Borrador | null>;
  updateBorrador(id: string, cambios: Partial<Borrador>): Promise<Borrador>;
  listBorradores(estado?: string): Promise<Borrador[]>;

  // Correcciones (datos de aprendizaje)
  saveCorreccion(correccion: Correccion): Promise<Correccion>;
  listCorrecciones(): Promise<Correccion[]>;

  // Base de conocimiento
  listKb(): Promise<DocumentoKB[]>;
  addKb(doc: DocumentoKB): Promise<DocumentoKB>;
  updateKb(id: string, cambios: Partial<DocumentoKB>): Promise<DocumentoKB | null>;
  deleteKb(id: string): Promise<void>;

  // Eventos de seguridad
  saveEventoSeguridad(evento: EventoSeguridad): Promise<EventoSeguridad>;
  listEventosSeguridad(): Promise<EventoSeguridad[]>;

  // --- Aprendizaje por correccion humana ---
  saveSuggestion(s: AiSuggestion): Promise<AiSuggestion>;
  getSuggestion(id: string): Promise<AiSuggestion | null>;
  updateSuggestion(id: string, cambios: Partial<AiSuggestion>): Promise<AiSuggestion>;
  listSuggestions(): Promise<AiSuggestion[]>;
  /** Suggestion 'pending' mas reciente de un ticket (para vincular el mensaje final). */
  getSuggestionPendiente(ticketId: string): Promise<AiSuggestion | null>;

  saveFinalMessage(m: ZendeskFinalMessage): Promise<ZendeskFinalMessage>;
  listFinalMessages(): Promise<ZendeskFinalMessage[]>;
  eventoYaProcesado(sourceEventId: string): Promise<boolean>;

  saveLearningEvent(e: AiLearningEvent): Promise<AiLearningEvent>;
  getLearningEvent(id: string): Promise<AiLearningEvent | null>;
  updateLearningEvent(id: string, cambios: Partial<AiLearningEvent>): Promise<AiLearningEvent>;
  listLearningEvents(): Promise<AiLearningEvent[]>;

  saveRegla(r: ReglaAprendida): Promise<ReglaAprendida>;
  listReglas(): Promise<ReglaAprendida[]>;
  saveEjemplo(e: EjemploEntrenamiento): Promise<EjemploEntrenamiento>;
  listEjemplos(): Promise<EjemploEntrenamiento[]>;

  // --- Importador historico de Zendesk ---
  saveImportJob(j: ImportJob): Promise<ImportJob>;
  getImportJob(id: string): Promise<ImportJob | null>;
  updateImportJob(id: string, cambios: Partial<ImportJob>): Promise<ImportJob>;
  listImportJobs(): Promise<ImportJob[]>;

  saveHistoricalTicket(t: HistoricalTicket): Promise<HistoricalTicket>;
  updateHistoricalTicket(zendeskTicketId: string, cambios: Partial<HistoricalTicket>): Promise<void>;
  listHistoricalTickets(jobId?: string): Promise<HistoricalTicket[]>;
  listAllHistoricalTickets(): Promise<HistoricalTicket[]>;
  getHistoricalTicketByZendeskId(zendeskTicketId: string): Promise<HistoricalTicket | null>;
  existeHistoricalTicket(zendeskTicketId: string): Promise<boolean>;
  saveHistoricalComment(c: HistoricalComment): Promise<HistoricalComment>;
  listHistoricalComments(zendeskTicketId: string): Promise<HistoricalComment[]>;
  deleteHistoricalComments(zendeskTicketId: string): Promise<void>;
  saveHistoricalSideConversation(s: HistoricalSideConversation): Promise<HistoricalSideConversation>;

  saveTrainingExample(e: TrainingExample): Promise<TrainingExample>;
  getTrainingExample(id: string): Promise<TrainingExample | null>;
  updateTrainingExample(id: string, cambios: Partial<TrainingExample>): Promise<TrainingExample>;
  listTrainingExamples(): Promise<TrainingExample[]>;

  // --- Dominios de conocimiento ---
  listDomains(): Promise<KnowledgeDomain[]>;
  getDomain(id: string): Promise<KnowledgeDomain | null>;
  upsertDomain(domain: KnowledgeDomain): Promise<KnowledgeDomain>;

  // --- Chatboxes ---
  listChatboxes(): Promise<Chatbox[]>;
  getChatbox(id: string): Promise<Chatbox | null>;
  upsertChatbox(chatbox: Chatbox): Promise<Chatbox>;

  // --- Permisos chatbox × dominio ---
  listPermissions(chatboxId?: string): Promise<ChatboxDomainPermission[]>;
  upsertPermission(perm: ChatboxDomainPermission): Promise<ChatboxDomainPermission>;
  deletePermission(id: string): Promise<void>;

  // --- Configuración del sistema ---
  listSettings(): Promise<SystemSetting[]>;
  getSetting(key: string): Promise<SystemSetting | null>;
  setSetting(key: string, value: string, updatedBy?: string, description?: string): Promise<SystemSetting>;

  // --- Eventos omitidos Zendesk ---
  logSkippedEvent(event: Omit<ZendeskSkippedEvent, "id" | "creadoEn">): Promise<ZendeskSkippedEvent>;
  listSkippedEvents(limit?: number): Promise<ZendeskSkippedEvent[]>;

  // --- Revisión de tickets ---
  saveTicketReview(r: ZendeskTicketReview): Promise<ZendeskTicketReview>;
  getTicketReview(id: string): Promise<ZendeskTicketReview | null>;
  getTicketReviewByZendeskId(zendeskTicketId: string): Promise<ZendeskTicketReview | null>;
  updateTicketReview(id: string, cambios: Partial<ZendeskTicketReview>): Promise<ZendeskTicketReview>;
  listTicketReviews(filtro?: { reviewStatus?: string; aiCategory?: string }): Promise<ZendeskTicketReview[]>;

  // --- Correcciones de clasificación ---
  saveClassificationCorrection(c: TicketClassificationCorrection): Promise<TicketClassificationCorrection>;
  listClassificationCorrections(zendeskTicketId?: string): Promise<TicketClassificationCorrection[]>;
}
