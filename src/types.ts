// Tipos de dominio de Doccia AI. Misma forma que las futuras tablas de la BD real.

export type Categoria =
  | "incidencias"
  | "garantias"
  | "logistica"
  | "producto"
  | "instalacion"
  | "comercial"
  | "presupuestos"
  | "facturacion"
  | "consultas_generales";

export const CATEGORIAS: Categoria[] = [
  "incidencias",
  "garantias",
  "logistica",
  "producto",
  "instalacion",
  "comercial",
  "presupuestos",
  "facturacion",
  "consultas_generales",
];

// Canal / bot que atiende. Cada uno tiene su tono y su ambito de conocimiento.
// "clientes" y "comerciales" son canales de la marca Doccia Group (B2B / fabricante).
// "bellobath" es la marca online independiente con KB y aprendizaje separados.
export type Canal = "clientes" | "comerciales" | "bellobath";
export const CANALES: Canal[] = ["clientes", "comerciales", "bellobath"];

// Ambito de un documento KB.
// "compartido" es compartido SOLO entre clientes y comerciales (Doccia). Bellobath tiene su propio ambito aislado.
export type AmbitoKb = "compartido" | "clientes" | "comerciales" | "bellobath";

export type Urgencia = "baja" | "media" | "alta";
export type EstadoBorrador =
  | "pendiente"
  | "aprobado"
  | "editado"
  | "rechazado"
  | "escalado";

export interface Ticket {
  id: string;
  canal: Canal;
  zendeskId: string | null;
  clienteNombre: string;
  clienteEmail: string;
  empresa: string | null;
  estado: string; // estado en Zendesk: nuevo, abierto, pendiente, resuelto...
  prioridad: string | null;
  etiquetas: string[];
  asunto: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Mensaje {
  id: string;
  ticketId: string;
  autor: "cliente" | "agente" | "ia";
  texto: string;
  creadoEn: string;
}

export interface Analisis {
  id: string;
  ticketId: string;
  categoria: Categoria;
  intencion: string;
  urgencia: Urgencia;
  enfado: number; // 0..1
  riesgo: number; // 0..1
  confianza: number; // 0..1
  modeloUsado: string;
  creadoEn: string;
}

export interface Borrador {
  id: string;
  ticketId: string;
  analisisId: string;
  textoPropuesto: string;
  fragmentosKbUsados: string[]; // ids de DocumentoKB
  estado: EstadoBorrador;
  confianza: number;
  modeloUsado: string;
  motivoEscalado: string | null;
  creadoEn: string;
}

export interface Correccion {
  id: string;
  borradorId: string;
  // Snapshot autosuficiente: guardamos el contexto dentro de la propia correccion
  // para que el historial de aprendizaje siga teniendo sentido tras un reinicio,
  // aunque el ticket/borrador original (en memoria) ya no exista.
  asuntoTicket: string;
  textoPropuestoIa: string;
  estadoFinal: "aprobado" | "editado" | "rechazado";
  textoFinalEnviado: string;
  motivoRechazo: string | null;
  agenteId: string;
  creadoEn: string;
}

// ============================================================
//  BASE DE CONOCIMIENTO — TIPOS EXTENDIDOS
// ============================================================

export type TipoDocumento =
  | "faq" | "procedimiento" | "garantia" | "catalogo" | "producto"
  | "regla" | "regla_negocio" | "caso_aprendido" | "plantilla" | "estilo"
  | "sap" | "historico" | "comercial" | "tecnico" | "pdf" | "manual" | "regla";

export type DominioKB =
  | "GLOBAL"            // Conocimiento compartido por todos los chatboxes
  | "DOCCIA_CLIENTES"   // Solo chatbox de clientes Doccia
  | "DOCCIA_COMERCIAL"  // Solo chatbox comercial Doccia
  | "BELLOBATH"         // Marca independiente — completamente aislada
  | "CASOS_APRENDIDOS"  // Aprendizaje reutilizable
  | "ESTILO"            // Guías de tono y estilo de respuesta
  | "PLANTILLAS"        // Respuestas y formatos reutilizables
  | "HISTORICOS"        // Histórico importado de Zendesk
  | "SAP";              // Integración futura SAP

export type CategoriaKB =
  | "Postventa" | "Logística" | "Pedidos" | "Comercial" | "Contabilidad"
  | "Garantías" | "Producto" | "Instalación" | "Cliente final" | "Distribuidor"
  | "Bellobath" | "SAP" | "Estilo" | "Plantillas" | "Sin clasificar";

export const SUBCATEGORIAS: Record<CategoriaKB, string[]> = {
  "Logística":      ["Pedido retrasado","Tracking","Pedido incompleto","Daño transporte","Entrega fallida","Dirección incorrecta","Reclamación transporte"],
  "Postventa":      ["Producto roto","Producto defectuoso","Falta pieza","Garantía","Reposición","Incidencia cliente"],
  "Pedidos":        ["Nuevo pedido","Modificación pedido","Cancelación pedido","Confirmación pedido","Error referencia"],
  "Comercial":      ["Precio","Descuento","Presupuesto","Catálogo","Nuevo cliente","Distribuidor","Argumentario","Objeciones"],
  "Contabilidad":   ["Factura","Abono","Vencimiento","Forma de pago","Impago"],
  "Producto":       ["Medidas","Acabados","Compatibilidad","Instalación","Documentación técnica"],
  "Garantías":      ["Garantía estándar","Garantía ampliada","Proceso reclamación","Exclusiones"],
  "Bellobath":      ["Comercial Bellobath","Postventa Bellobath","Producto Bellobath","Logística Bellobath"],
  "Instalación":    ["Guía instalación","Requisitos previos","Errores comunes","Mantenimiento"],
  "Cliente final":  ["Atención cliente","Reclamaciones","Satisfacción","Devoluciones"],
  "Distribuidor":   ["Condiciones comerciales","Precios distribuidor","Formación","Soporte técnico"],
  "SAP":            ["Consulta stock","Creación pedido","Facturas SAP","Bloqueos"],
  "Estilo":         ["Tono de voz","Firma email","Plantilla respuesta","Ejemplos buenos"],
  "Plantillas":     ["Respuesta tipo","Notificación","Confirmación","Escalado"],
  "Sin clasificar": [],
};

export type NivelAcceso =
  | "publico" | "clientes" | "comercial" | "interno"
  | "confidencial" | "administracion" | "bellobath";

export type UsadoPorKB =
  | "chatbox_doccia_clientes" | "chatbox_doccia_comercial" | "chatbox_bellobath"
  | "zendesk_ai" | "importador_historico" | "sap_ai";

export type PrioridadKB = "critical" | "high" | "medium" | "low";

export type StatusKB = "activo" | "pendiente" | "pending_review" | "borrador" | "inactivo";

export const AMBITO_TO_DOMINIO: Record<AmbitoKb, DominioKB> = {
  compartido:   "GLOBAL",
  clientes:     "DOCCIA_CLIENTES",
  comerciales:  "DOCCIA_COMERCIAL",
  bellobath:    "BELLOBATH",
};

export interface DocumentoKB {
  id: string;
  titulo: string;
  descripcion: string;
  texto: string;
  tipo: TipoDocumento;
  dominio: DominioKB;
  categoria: CategoriaKB;
  subcategoria: string | null;
  nivelAcceso: NivelAcceso;
  usadoPor: UsadoPorKB[];
  prioridad: PrioridadKB;
  status: StatusKB;
  tags: string[];
  fuente: string | null;
  version: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface EventoSeguridad {
  id: string;
  ticketId: string;
  reglaDisparada: string;
  detalle: string;
  creadoEn: string;
}

// ============================================================
//  APRENDIZAJE POR CORRECCION HUMANA (trazabilidad IA <-> humano)
// ============================================================

// Tipo de mensaje capturado desde Zendesk (no solo respuestas publicas).
export type MessageType =
  | "public_customer_reply"
  | "internal_note"
  | "side_conversation"
  | "internal_department_reply"
  | "forwarded_message";

export type SuggestionType = MessageType; // que tipo de mensaje propuso la IA
export type TargetType = "cliente" | "departamento_interno" | "logistica" | "contabilidad" | "otro";

export type SuggestionStatus =
  | "pending"
  | "used_without_changes"
  | "used_with_changes"
  | "used_with_major_changes"
  | "ignored"
  | "rejected"
  | "expired";

export type LearningStatus = "pending" | "approved" | "rejected";

// Tabla: ai_suggestions  (lo que propuso la IA)
export interface AiSuggestion {
  id: string;
  ticketId: string;
  borradorId: string | null; // enlace interno al borrador que la origino
  zendeskTicketId: string | null;
  zendeskCommentId: string | null;
  suggestionType: SuggestionType;
  targetType: TargetType;
  suggestedText: string;
  suggestedSubject: string | null;
  modelUsed: string;
  confidenceScore: number;
  category: Categoria | null;
  groupId: string | null;
  assigneeId: string | null;
  requesterId: string | null;
  status: SuggestionStatus;
  createdAt: string;
}

// Tabla: zendesk_final_messages  (lo que realmente se envio/escribio)
export interface ZendeskFinalMessage {
  id: string;
  ticketId: string;
  zendeskTicketId: string | null;
  zendeskCommentId: string | null;
  messageType: MessageType;
  visibility: "public" | "internal";
  authorId: string | null;
  authorRole: string | null;
  recipientType: TargetType;
  bodyText: string;
  bodyHtml: string | null;
  sourceEventId: string; // para deduplicar eventos
  matched: boolean; // false => unmatched_final_message
  createdAt: string;
}

// Tabla: ai_learning_events  (la comparacion + aprendizaje, pendiente de aprobacion)
export interface AiLearningEvent {
  id: string;
  ticketId: string;
  suggestionId: string;
  finalMessageId: string;
  originalAiText: string;
  finalHumanText: string;
  similarityScore: number; // 0..1
  diffSummary: string;
  detectedChanges: string[];
  learningSummary: string;
  category: Categoria | null;
  agentId: string | null;
  status: LearningStatus;
  approvedForTraining: boolean;
  createdAt: string;
}

// Salidas de un aprendizaje aprobado:
export interface ReglaAprendida {
  id: string;
  texto: string;
  category: Categoria | null;
  origenLearningId: string;
  creadoEn: string;
}

export interface EjemploEntrenamiento {
  id: string;
  textoIa: string;
  textoHumano: string;
  category: Categoria | null;
  origenLearningId: string;
  creadoEn: string;
}

// ============================================================
//  IMPORTADOR HISTORICO DE ZENDESK
// ============================================================

export interface FiltrosImportacion {
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  grupo?: string | string[] | null;
  agente?: string | string[] | null;
  estado?: string | string[] | null;
  prioridad?: string | string[] | null;
  tags?: string[];
  canal?: string | string[] | null;
  marca?: string | string[] | null;
  departamento?: string | string[] | null;
  submotivo?: string | string[] | null;
  busqueda?: string | null;
  tipo?: string | null;
  formulario?: string | null;
  excluirReclamaciones?: boolean;
}

export type ImportJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partially_completed"
  | "cancelled";

// Tabla: zendesk_historical_import_jobs
export interface ImportJob {
  id: string;
  startedByUserId: string | null;
  filters: FiltrosImportacion;
  status: ImportJobStatus;
  totalTicketsFound: number;
  totalTicketsImported: number;
  totalCommentsImported: number;
  totalSideConversationsImported: number;
  errorsCount: number;
  startedAt: string;
  completedAt: string | null;
}

// Tabla: zendesk_historical_tickets
export interface HistoricalTicket {
  id: string;
  jobId: string;
  zendeskTicketId: string;
  subject: string;
  status: string;
  priority: string | null;
  type: string | null;
  channel: string | null;
  groupId: string | null;
  assigneeId: string | null;
  requesterId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  organizationId: string | null;
  organizationName: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  formId: string | null;
  inboundEmail: string | null;
  // Origen / trazabilidad
  origenCanal: string | null;       // "voice", "email", "web", "api", "chat", etc.
  origenRel: string | null;         // "follow_up" si es ticket derivado de otro
  origenTicketId: string | null;    // ID del ticket padre si es follow_up
  origenTicketTitulo: string | null;// Asunto del ticket padre
  primeraRespuestaEsAgente: boolean; // true si el primer comentario es del agente (contexto incompleto)
  // Calidad como ejemplo de entrenamiento
  calidadScore: number | null;       // 0-100
  calidadLabel: "excelente" | "bueno" | "mejorable" | "descartar" | null;
  calidadRazones: string[] | null;   // explicación de la puntuación
  createdAt: string;
  solvedAt: string | null;
  updatedAt: string | null;
  importedAt: string;
}

export interface HistoricalAttachment {
  zendeskAttachmentId: string;
  fileName: string;
  contentType: string;
  size: number;
  localPath: string | null; // ruta relativa dentro de data/attachments/
}

// Tabla: zendesk_historical_comments
export interface HistoricalComment {
  id: string;
  zendeskCommentId: string;
  zendeskTicketId: string;
  authorId: string | null;
  authorRole: "cliente" | "agente" | "sistema";
  isPublic: boolean;
  messageType: MessageType;
  bodyText: string; // ya anonimizado
  bodyHtml: string | null;
  attachments: HistoricalAttachment[];
  detectedLanguage: string | null;  // "es", "en", "fr", etc.
  bodyTextEs: string | null;        // traducción al español (null si ya es español)
  createdAt: string;
  importedAt: string;
}

// Tabla: zendesk_historical_side_conversations
export interface HistoricalSideConversation {
  id: string;
  zendeskSideConversationId: string;
  zendeskTicketId: string;
  subject: string;
  participants: string[];
  tipo: "consulta_interna" | "reenvio_departamento" | "respuesta_departamento" | "proveedor" | "logistica" | "contabilidad";
  status: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string | null;
  importedAt: string;
}

export type TrainingExampleStatus = "pendiente" | "aprobado" | "rechazado" | "necesita_edicion";

// ============================================================
//  DOMINIOS DE CONOCIMIENTO
// ============================================================

export type DomainCode =
  | "GLOBAL"
  | "DOCCIA_CLIENTES"
  | "DOCCIA_COMERCIAL"
  | "BELLOBATH"
  | "SAP"
  | "HISTORICOS"
  | "CASOS_APRENDIDOS";

export interface KnowledgeDomain {
  id: string;
  code: DomainCode;
  name: string;
  description: string;
  isActive: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

// ============================================================
//  CHATBOXES
// ============================================================

export type ChatboxCode = "doccia_clientes" | "doccia_comercial" | "bellobath";

export interface Chatbox {
  id: string;
  code: ChatboxCode;
  name: string;
  description: string;
  defaultModel: string;
  isActive: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

// ============================================================
//  PERMISOS CHATBOX × DOMINIO
// ============================================================

export type AccessLevel = "full" | "read_only" | "none";

export interface ChatboxDomainPermission {
  id: string;
  chatboxId: string;
  domainId: string;
  accessLevel: AccessLevel;
  canRead: boolean;
  canWrite: boolean;
  canTrain: boolean;
  creadoEn: string;
}

// ============================================================
//  CONFIGURACIÓN DEL SISTEMA
// ============================================================

export type SystemSettingKey =
  | "zendesk_webhook_processing_enabled"
  | "zendesk_import_enabled"
  | "zendesk_ai_processing_enabled"
  | "zendesk_historical_import_enabled";

export interface SystemSetting {
  id: string;
  key: string;
  value: string; // 'true' | 'false' | any string value
  description: string;
  updatedBy: string;
  updatedAt: string;
}

// ============================================================
//  EVENTOS OMITIDOS DE ZENDESK
// ============================================================

export type SkippedReason =
  | "import_disabled"
  | "ai_processing_disabled"
  | "webhook_processing_disabled"
  | "duplicate_event"
  | "invalid_payload"
  | "ignored_by_rule"
  | "llamada_ringover";

export interface ZendeskSkippedEvent {
  id: string;
  sourceEventId: string | null;
  zendeskTicketId: string | null;
  reason: SkippedReason;
  payloadJson: Record<string, unknown>;
  creadoEn: string;
}

// ============================================================
//  REVISIÓN DE TICKETS (Fase 3)
// ============================================================

export type ReviewStatus =
  | "pendiente_revision"
  | "revisado"
  | "aprobado_para_aprendizaje"
  | "rechazado"
  | "necesita_reclasificacion"
  | "ignorado";

export type CategoriaIA =
  | "postventa"
  | "logistica"
  | "comercial"
  | "pedidos"
  | "contabilidad"
  | "garantias"
  | "incidencias"
  | "producto"
  | "instalacion"
  | "cliente_final"
  | "distribuidor"
  | "bellobath"
  | "sin_clasificar";

export interface ZendeskTicketReview {
  id: string;
  zendeskTicketId: string;
  subject: string;
  requesterId: string | null;
  organizationId: string | null;
  groupId: string | null;
  assigneeId: string | null;
  channel: string | null;
  inboundEmail: string | null;
  zendeskStatus: string;
  zendeskPriority: string | null;
  zendeskTagsJson: string[];
  zendeskFormId: string | null;
  zendeskCategory: string | null;
  departamento: string | null;
  submotivo: string | null;
  aiCategory: CategoriaIA | null;
  aiSubcategory: string | null;
  aiConfidence: number | null;
  aiRiskLevel: number | null;
  aiDetectedIntent: string | null;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  aiDraftText: string | null;
  mensajesTexto: { autor: string; texto: string; isPublic: boolean }[] | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface TicketClassificationCorrection {
  id: string;
  zendeskTicketId: string;
  originalAiCategory: CategoriaIA | null;
  correctedCategory: CategoriaIA;
  originalAiSubcategory: string | null;
  correctedSubcategory: string | null;
  correctionReason: string | null;
  correctedBy: string;
  creadoEn: string;
}

// Tabla: ai_training_examples
export interface TrainingExample {
  id: string;
  sourceType: "historico" | "correccion";
  sourceTicketId: string | null;
  sourceCommentId: string | null;
  category: Categoria | null;
  customerMessage: string;
  contextSummary: string;
  humanResponse: string;
  internalReasoningSummary: string;
  tags: string[];
  qualityScore: number; // 0..1 (lo estima la IA)
  buenEjemplo: boolean;
  reglaPropuesta: string;
  status: TrainingExampleStatus;
  approvedForTraining: boolean;
  createdAt: string;
  // Metadatos del ticket de origen para filtrado
  ticketStatus: string | null;
  ticketPriority: string | null;
  ticketChannel: string | null;
  ticketGroupId: string | null;
  ticketAssigneeId: string | null;
  ticketDepartamento: string | null;
  ticketSubmotivo: string | null;
  ticketInboundEmail: string | null;
  importJobId: string | null;
}
