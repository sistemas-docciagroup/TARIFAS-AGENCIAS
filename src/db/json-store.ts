import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MockStore } from "./mock-store.js";
import type {
  AiLearningEvent,
  AiSuggestion,
  Chatbox,
  ChatboxDomainPermission,
  Correccion,
  DocumentoKB,
  EjemploEntrenamiento,
  HistoricalComment,
  HistoricalSideConversation,
  HistoricalTicket,
  ImportJob,
  KnowledgeDomain,
  ReglaAprendida,
  SystemSetting,
  TicketClassificationCorrection,
  TrainingExample,
  ZendeskFinalMessage,
  ZendeskSkippedEvent,
  ZendeskTicketReview,
  CategoriaKB,
  DominioKB,
  NivelAcceso,
  TipoDocumento,
  UsadoPorKB,
  PrioridadKB,
  StatusKB,
} from "../types.js";
import { AMBITO_TO_DOMINIO } from "../types.js";

// ---- Migración KB: convierte documentos del formato antiguo al nuevo ----
function migrarDocumentoKB(raw: Record<string, unknown>): DocumentoKB {
  const ambitoAntiguo = raw.ambito as string | undefined;
  const dominio: DominioKB =
    (raw.dominio as DominioKB) ??
    (ambitoAntiguo ? AMBITO_TO_DOMINIO[ambitoAntiguo as keyof typeof AMBITO_TO_DOMINIO] : undefined) ??
    "GLOBAL";

  const tipoRaw = String(raw.tipo ?? "faq");
  const tipo: TipoDocumento = tipoRaw as TipoDocumento;

  // Auto-categoría si no existe
  let categoria: CategoriaKB = (raw.categoria as CategoriaKB) ?? "Sin clasificar";
  if (!raw.categoria) {
    const t = (String(raw.titulo ?? "") + " " + String(raw.texto ?? "")).toLowerCase();
    if (t.includes("garantía") || t.includes("garantia") || tipo === "garantia") categoria = "Garantías";
    else if (dominio === "BELLOBATH" || t.includes("bellobath")) categoria = "Bellobath";
    else if (t.includes("logísti") || t.includes("logisti") || t.includes("envío") || t.includes("transporte")) categoria = "Logística";
    else if (t.includes("precio") || t.includes("tarifa") || t.includes("descuento") || t.includes("presupuesto")) categoria = "Comercial";
    else if (t.includes("producto") || t.includes("medidas") || t.includes("catálogo") || t.includes("catalogo")) categoria = "Producto";
    else if (t.includes("postventa") || t.includes("rotura") || t.includes("defecto") || t.includes("incidencia")) categoria = "Postventa";
    else if (t.includes("factura") || t.includes("pago") || t.includes("abono")) categoria = "Contabilidad";
    else if (t.includes("pedido")) categoria = "Pedidos";
    else if (t.includes("instalación") || t.includes("instalacion")) categoria = "Instalación";
    else if (tipo === "estilo" || dominio === "ESTILO") categoria = "Estilo";
    else if (tipo === "plantilla" || dominio === "PLANTILLAS") categoria = "Plantillas";
  }

  // Nivel de acceso por defecto según dominio
  let nivelAcceso: NivelAcceso = (raw.nivelAcceso as NivelAcceso) ?? "clientes";
  if (!raw.nivelAcceso) {
    if (dominio === "BELLOBATH") nivelAcceso = "bellobath";
    else if (dominio === "DOCCIA_COMERCIAL") nivelAcceso = "comercial";
    else if (dominio === "ESTILO" || dominio === "PLANTILLAS") nivelAcceso = "interno";
    else if (categoria === "Comercial") nivelAcceso = "interno";
    else nivelAcceso = "clientes";
  }

  // Usado por según dominio
  const TODOS_CHATBOXES: UsadoPorKB[] = ["chatbox_doccia_clientes", "chatbox_doccia_comercial", "chatbox_bellobath"];
  let usadoPor: UsadoPorKB[] = Array.isArray(raw.usadoPor) ? (raw.usadoPor as UsadoPorKB[]) : [];
  // Limpiamos valores obsoletos (zendesk_ai, importador_historico, sap_ai) que ya no se usan en UI
  usadoPor = usadoPor.filter(u => ["chatbox_doccia_clientes","chatbox_doccia_comercial","chatbox_bellobath"].includes(u));
  if (usadoPor.length === 0) {
    if (dominio === "BELLOBATH") usadoPor = ["chatbox_bellobath"];
    else if (dominio === "DOCCIA_COMERCIAL") usadoPor = ["chatbox_doccia_comercial"];
    else if (dominio === "DOCCIA_CLIENTES") usadoPor = ["chatbox_doccia_clientes"];
    else if (dominio === "ESTILO" || dominio === "PLANTILLAS" || dominio === "GLOBAL") usadoPor = [...TODOS_CHATBOXES];
    else usadoPor = ["chatbox_doccia_clientes", "chatbox_doccia_comercial"];
  }

  const statusRaw = raw.status as string | undefined;
  const validStatuses: StatusKB[] = ["activo","pendiente","pending_review","borrador","inactivo"];
  const status: StatusKB = validStatuses.includes(statusRaw as StatusKB) ? (statusRaw as StatusKB) : "activo";

  const prioridades: PrioridadKB[] = ["critical","high","medium","low"];
  const prioridad: PrioridadKB = prioridades.includes(raw.prioridad as PrioridadKB) ? (raw.prioridad as PrioridadKB) : "medium";

  return {
    id:           String(raw.id),
    titulo:       String(raw.titulo ?? "Sin título"),
    descripcion:  String(raw.descripcion ?? ""),
    texto:        String(raw.texto ?? ""),
    tipo,
    dominio,
    categoria,
    subcategoria: (raw.subcategoria as string) ?? null,
    nivelAcceso,
    usadoPor,
    prioridad,
    status,
    tags:         Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    fuente:       (raw.fuente as string) ?? null,
    version:      String(raw.version ?? "1.0"),
    creadoEn:     String(raw.creadoEn ?? new Date().toISOString()),
    actualizadoEn: String(raw.actualizadoEn ?? raw.creadoEn ?? new Date().toISOString()),
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const KB_FILE = join(DATA_DIR, "kb.json");
const CORR_FILE = join(DATA_DIR, "correcciones.json");
const SUGG_FILE = join(DATA_DIR, "suggestions.json");
const FINAL_FILE = join(DATA_DIR, "final-messages.json");
const LEARN_FILE = join(DATA_DIR, "learning-events.json");
const REGLAS_FILE = join(DATA_DIR, "reglas.json");
const EJEMPLOS_FILE = join(DATA_DIR, "ejemplos.json");
const JOBS_FILE = join(DATA_DIR, "import-jobs.json");
const HTICKETS_FILE = join(DATA_DIR, "hist-tickets.json");
const HCOMMENTS_FILE = join(DATA_DIR, "hist-comments.json");
const HSIDE_FILE = join(DATA_DIR, "hist-side-conversations.json");
const TRAINING_FILE = join(DATA_DIR, "training-examples.json");
const DOMAINS_FILE = join(DATA_DIR, "domains.json");
const CHATBOXES_FILE = join(DATA_DIR, "chatboxes.json");
const PERMISSIONS_FILE = join(DATA_DIR, "permissions.json");
const SETTINGS_FILE = join(DATA_DIR, "settings.json");
const SKIPPED_FILE = join(DATA_DIR, "skipped-events.json");
const REVIEWS_FILE = join(DATA_DIR, "ticket-reviews.json");
const CORRECTIONS_FILE = join(DATA_DIR, "classification-corrections.json");

/**
 * Store con persistencia LIGERA en disco. Hereda toda la logica en memoria de
 * MockStore, pero guarda en ficheros JSON SOLO lo que importa conservar entre
 * reinicios:
 *   - Base de conocimiento (documentos que consulta la IA)
 *   - Correcciones (el historial de aprendizaje)
 * El resto (tickets, mensajes, analisis, borradores, eventos) sigue en memoria,
 * porque son temporales o se re-derivan desde Zendesk.
 */
export class JsonStore extends MockStore {
  constructor() {
    super();
    mkdirSync(DATA_DIR, { recursive: true });
    this.cargar();
  }

  private cargar() {
    if (existsSync(KB_FILE)) {
      const docs = JSON.parse(readFileSync(KB_FILE, "utf8")) as Record<string, unknown>[];
      for (const raw of docs) {
        const d = migrarDocumentoKB(raw);
        this.kb.set(d.id, d);
      }
    }
    if (existsSync(CORR_FILE)) {
      this.correcciones = JSON.parse(readFileSync(CORR_FILE, "utf8")) as Correccion[];
    }
    if (existsSync(SUGG_FILE)) {
      for (const s of JSON.parse(readFileSync(SUGG_FILE, "utf8")) as AiSuggestion[]) {
        this.suggestions.set(s.id, s);
      }
    }
    if (existsSync(FINAL_FILE)) {
      this.finalMessages = JSON.parse(readFileSync(FINAL_FILE, "utf8")) as ZendeskFinalMessage[];
    }
    if (existsSync(LEARN_FILE)) {
      for (const e of JSON.parse(readFileSync(LEARN_FILE, "utf8")) as AiLearningEvent[]) {
        this.learningEvents.set(e.id, e);
      }
    }
    if (existsSync(REGLAS_FILE)) {
      // Migración única: mueve las reglas antiguas a KB como docs tipo "regla" activos
      const reglasPrev = JSON.parse(readFileSync(REGLAS_FILE, "utf8")) as ReglaAprendida[];
      const kbIds = new Set([...this.kb.values()].map((d) => d.fuente));
      for (const r of reglasPrev) {
        if (kbIds.has(`regla-legacy:${r.id}`)) continue;
        const ahora = r.creadoEn ?? new Date().toISOString();
        const doc: DocumentoKB = {
          id: r.id,
          titulo: r.texto.slice(0, 120).trim(),
          descripcion: "Migrada desde reglas aprendidas",
          texto: r.texto,
          tipo: "regla" as TipoDocumento,
          dominio: "CASOS_APRENDIDOS" as DominioKB,
          categoria: (r.category ?? "Sin clasificar") as CategoriaKB,
          subcategoria: null,
          nivelAcceso: "clientes" as NivelAcceso,
          usadoPor: ["chatbox_doccia_clientes", "chatbox_doccia_comercial", "chatbox_bellobath"] as UsadoPorKB[],
          prioridad: "high",
          status: "activo",
          tags: ["regla-aprendida"],
          fuente: `regla-legacy:${r.id}`,
          version: "1.0",
          creadoEn: ahora,
          actualizadoEn: ahora,
        };
        this.kb.set(doc.id, doc);
      }
      if (reglasPrev.length > 0) this.guardarKb();
      // Ya no se necesita reglas.json — renombrar para no re-migrar
      writeFileSync(REGLAS_FILE + ".migrated", JSON.stringify(reglasPrev, null, 2), "utf8");
      writeFileSync(REGLAS_FILE, "[]", "utf8");
    }
    if (existsSync(EJEMPLOS_FILE)) {
      this.ejemplos = JSON.parse(readFileSync(EJEMPLOS_FILE, "utf8")) as EjemploEntrenamiento[];
    }
    if (existsSync(JOBS_FILE)) {
      for (const j of JSON.parse(readFileSync(JOBS_FILE, "utf8")) as ImportJob[]) {
        this.importJobs.set(j.id, j);
      }
    }
    if (existsSync(HTICKETS_FILE)) {
      this.histTickets = JSON.parse(readFileSync(HTICKETS_FILE, "utf8")) as HistoricalTicket[];
    }
    if (existsSync(HCOMMENTS_FILE)) {
      this.histComments = JSON.parse(readFileSync(HCOMMENTS_FILE, "utf8")) as HistoricalComment[];
    }
    if (existsSync(HSIDE_FILE)) {
      this.histSideConvs = JSON.parse(readFileSync(HSIDE_FILE, "utf8")) as HistoricalSideConversation[];
    }
    if (existsSync(TRAINING_FILE)) {
      for (const e of JSON.parse(readFileSync(TRAINING_FILE, "utf8")) as TrainingExample[]) {
        this.trainingExamples.set(e.id, e);
      }
    }
    if (existsSync(DOMAINS_FILE)) {
      for (const d of JSON.parse(readFileSync(DOMAINS_FILE, "utf8")) as KnowledgeDomain[]) {
        this.domains.set(d.id, d);
      }
    }
    if (existsSync(CHATBOXES_FILE)) {
      for (const c of JSON.parse(readFileSync(CHATBOXES_FILE, "utf8")) as Chatbox[]) {
        this.chatboxes.set(c.id, c);
      }
    }
    if (existsSync(PERMISSIONS_FILE)) {
      for (const p of JSON.parse(readFileSync(PERMISSIONS_FILE, "utf8")) as ChatboxDomainPermission[]) {
        this.permissions.set(p.id, p);
      }
    }
    if (existsSync(SETTINGS_FILE)) {
      for (const s of JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as SystemSetting[]) {
        this.settings.set(s.id, s);
      }
    }
    if (existsSync(SKIPPED_FILE)) {
      this.skippedEvents = JSON.parse(readFileSync(SKIPPED_FILE, "utf8")) as ZendeskSkippedEvent[];
    }
    if (existsSync(REVIEWS_FILE)) {
      for (const r of JSON.parse(readFileSync(REVIEWS_FILE, "utf8")) as ZendeskTicketReview[]) {
        this.ticketReviews.set(r.id, r);
      }
    }
    if (existsSync(CORRECTIONS_FILE)) {
      this.classificationCorrections = JSON.parse(readFileSync(CORRECTIONS_FILE, "utf8")) as TicketClassificationCorrection[];
    }
  }

  private guardarKb() {
    writeFileSync(KB_FILE, JSON.stringify([...this.kb.values()], null, 2), "utf8");
  }
  private guardarCorrecciones() {
    writeFileSync(CORR_FILE, JSON.stringify(this.correcciones, null, 2), "utf8");
  }
  private guardarSuggestions() {
    writeFileSync(SUGG_FILE, JSON.stringify([...this.suggestions.values()], null, 2), "utf8");
  }
  private guardarFinales() {
    writeFileSync(FINAL_FILE, JSON.stringify(this.finalMessages, null, 2), "utf8");
  }
  private guardarLearning() {
    writeFileSync(LEARN_FILE, JSON.stringify([...this.learningEvents.values()], null, 2), "utf8");
  }
  private guardarReglas() {
    writeFileSync(REGLAS_FILE, JSON.stringify(this.reglas, null, 2), "utf8");
  }
  private guardarEjemplos() {
    writeFileSync(EJEMPLOS_FILE, JSON.stringify(this.ejemplos, null, 2), "utf8");
  }
  private guardarJobs() {
    writeFileSync(JOBS_FILE, JSON.stringify([...this.importJobs.values()], null, 2), "utf8");
  }
  private guardarHistTickets() {
    writeFileSync(HTICKETS_FILE, JSON.stringify(this.histTickets, null, 2), "utf8");
  }
  private guardarHistComments() {
    writeFileSync(HCOMMENTS_FILE, JSON.stringify(this.histComments, null, 2), "utf8");
  }
  private guardarHistSide() {
    writeFileSync(HSIDE_FILE, JSON.stringify(this.histSideConvs, null, 2), "utf8");
  }
  private guardarTraining() {
    writeFileSync(TRAINING_FILE, JSON.stringify([...this.trainingExamples.values()], null, 2), "utf8");
  }
  private guardarDomains() {
    writeFileSync(DOMAINS_FILE, JSON.stringify([...this.domains.values()], null, 2), "utf8");
  }
  private guardarChatboxes() {
    writeFileSync(CHATBOXES_FILE, JSON.stringify([...this.chatboxes.values()], null, 2), "utf8");
  }
  private guardarPermissions() {
    writeFileSync(PERMISSIONS_FILE, JSON.stringify([...this.permissions.values()], null, 2), "utf8");
  }
  private guardarSettings() {
    writeFileSync(SETTINGS_FILE, JSON.stringify([...this.settings.values()], null, 2), "utf8");
  }
  private guardarSkipped() {
    writeFileSync(SKIPPED_FILE, JSON.stringify(this.skippedEvents.slice(0, 1000), null, 2), "utf8");
  }
  private guardarReviews() {
    writeFileSync(REVIEWS_FILE, JSON.stringify([...this.ticketReviews.values()], null, 2), "utf8");
  }
  private guardarCorrections() {
    writeFileSync(CORRECTIONS_FILE, JSON.stringify(this.classificationCorrections, null, 2), "utf8");
  }

  // --- Sobrescribimos solo las escrituras que deben persistir ---
  override async addKb(doc: DocumentoKB) {
    const r = await super.addKb(doc);
    this.guardarKb();
    return r;
  }
  override async updateKb(id: string, cambios: Partial<DocumentoKB>) {
    const r = await super.updateKb(id, cambios);
    if (r) this.guardarKb();
    return r;
  }
  override async deleteKb(id: string) {
    await super.deleteKb(id);
    this.guardarKb();
  }
  override async saveCorreccion(correccion: Correccion) {
    const r = await super.saveCorreccion(correccion);
    this.guardarCorrecciones();
    return r;
  }

  override async saveSuggestion(s: AiSuggestion) {
    const r = await super.saveSuggestion(s);
    this.guardarSuggestions();
    return r;
  }
  override async updateSuggestion(id: string, cambios: Partial<AiSuggestion>) {
    const r = await super.updateSuggestion(id, cambios);
    this.guardarSuggestions();
    return r;
  }
  override async saveFinalMessage(m: ZendeskFinalMessage) {
    const r = await super.saveFinalMessage(m);
    this.guardarFinales();
    return r;
  }
  override async saveLearningEvent(e: AiLearningEvent) {
    const r = await super.saveLearningEvent(e);
    this.guardarLearning();
    return r;
  }
  override async updateLearningEvent(id: string, cambios: Partial<AiLearningEvent>) {
    const r = await super.updateLearningEvent(id, cambios);
    this.guardarLearning();
    return r;
  }
  override async saveRegla(r: ReglaAprendida) {
    const x = await super.saveRegla(r);
    this.guardarReglas();
    return x;
  }
  override async saveEjemplo(e: EjemploEntrenamiento) {
    const x = await super.saveEjemplo(e);
    this.guardarEjemplos();
    return x;
  }

  override async saveImportJob(j: ImportJob) {
    const x = await super.saveImportJob(j);
    this.guardarJobs();
    return x;
  }
  override async updateImportJob(id: string, cambios: Partial<ImportJob>) {
    const x = await super.updateImportJob(id, cambios);
    this.guardarJobs();
    return x;
  }
  override async saveHistoricalTicket(t: HistoricalTicket) {
    const x = await super.saveHistoricalTicket(t);
    this.guardarHistTickets();
    return x;
  }
  override async updateHistoricalTicket(zendeskTicketId: string, cambios: Partial<HistoricalTicket>) {
    await super.updateHistoricalTicket(zendeskTicketId, cambios);
    this.guardarHistTickets();
  }
  override async saveHistoricalComment(c: HistoricalComment) {
    const x = await super.saveHistoricalComment(c);
    this.guardarHistComments();
    return x;
  }
  override async deleteHistoricalComments(zendeskTicketId: string) {
    await super.deleteHistoricalComments(zendeskTicketId);
    this.guardarHistComments();
  }
  override async saveHistoricalSideConversation(s: HistoricalSideConversation) {
    const x = await super.saveHistoricalSideConversation(s);
    this.guardarHistSide();
    return x;
  }
  override async saveTrainingExample(e: TrainingExample) {
    const x = await super.saveTrainingExample(e);
    this.guardarTraining();
    return x;
  }
  override async updateTrainingExample(id: string, cambios: Partial<TrainingExample>) {
    const x = await super.updateTrainingExample(id, cambios);
    this.guardarTraining();
    return x;
  }

  // --- Dominios ---
  override async upsertDomain(domain: import("../types.js").KnowledgeDomain) {
    const x = await super.upsertDomain(domain);
    this.guardarDomains();
    return x;
  }

  // --- Chatboxes ---
  override async upsertChatbox(chatbox: import("../types.js").Chatbox) {
    const x = await super.upsertChatbox(chatbox);
    this.guardarChatboxes();
    return x;
  }

  // --- Permisos ---
  override async upsertPermission(perm: import("../types.js").ChatboxDomainPermission) {
    const x = await super.upsertPermission(perm);
    this.guardarPermissions();
    return x;
  }
  override async deletePermission(id: string) {
    await super.deletePermission(id);
    this.guardarPermissions();
  }

  // --- Settings ---
  override async setSetting(key: string, value: string, updatedBy?: string, description?: string) {
    const x = await super.setSetting(key, value, updatedBy, description);
    this.guardarSettings();
    return x;
  }

  // --- Eventos omitidos ---
  override async logSkippedEvent(event: Omit<import("../types.js").ZendeskSkippedEvent, "id" | "creadoEn">) {
    const x = await super.logSkippedEvent(event);
    this.guardarSkipped();
    return x;
  }

  // --- Revisión de tickets ---
  override async saveTicketReview(r: import("../types.js").ZendeskTicketReview) {
    const x = await super.saveTicketReview(r);
    this.guardarReviews();
    return x;
  }
  override async updateTicketReview(id: string, cambios: Partial<import("../types.js").ZendeskTicketReview>) {
    const x = await super.updateTicketReview(id, cambios);
    this.guardarReviews();
    return x;
  }

  // --- Correcciones de clasificación ---
  override async saveClassificationCorrection(c: import("../types.js").TicketClassificationCorrection) {
    const x = await super.saveClassificationCorrection(c);
    this.guardarCorrections();
    return x;
  }

  /** ¿Ya hay KB persistida en disco? Lo usa el seed para no duplicar ejemplos. */
  get kbVacia(): boolean {
    return this.kb.size === 0;
  }

  /** ¿Ya hay dominios seeded? */
  get domainsVacios(): boolean {
    return this.domains.size === 0;
  }
}
