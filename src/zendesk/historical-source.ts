import { config } from "../config.js";
import type { FiltrosImportacion, MessageType } from "../types.js";

export interface RawAttachment {
  zendeskAttachmentId: string;
  fileName: string;
  contentType: string;
  size: number;
  contentUrl: string; // URL temporal de Zendesk para descargar
}

// Forma "cruda" de un ticket historico tal como vendria de Zendesk.
export interface RawHistoricalComment {
  zendeskCommentId: string;
  authorId: string | null;
  authorRole: "cliente" | "agente" | "sistema";
  isPublic: boolean;
  messageType: MessageType;
  bodyText: string;
  bodyHtml: string | null;
  attachments?: RawAttachment[];
  createdAt: string;
}
export interface RawSideConversation {
  zendeskSideConversationId: string;
  subject: string;
  participants: string[];
  tipo: "consulta_interna" | "reenvio_departamento" | "respuesta_departamento" | "proveedor" | "logistica" | "contabilidad";
  status: string;
  bodyText: string;
  createdAt: string;
  updatedAt: string | null;
}
export interface RawHistoricalTicket {
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
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  organizationId: string | null;
  organizationName?: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
  formId: string | null;
  inboundEmail: string | null;
  origenCanal?: string | null;
  origenRel?: string | null;
  origenTicketId?: string | null;
  origenTicketTitulo?: string | null;
  primeraRespuestaEsAgente?: boolean;
  createdAt: string;
  solvedAt: string | null;
  updatedAt: string | null;
  comments: RawHistoricalComment[];
  sideConversations: RawSideConversation[];
}

export interface HistoricalSource {
  fetchTickets(filtros: FiltrosImportacion): Promise<RawHistoricalTicket[]>;
}

const zendeskConfigurado =
  !!config.zendesk.subdomain && !!config.zendesk.email && !!config.zendesk.apiToken;

/**
 * Implementacion MOCK: devuelve tickets historicos de ejemplo.
 * Cuando conectes Zendesk, implementa `fetchTickets` con la Search API
 * (GET /api/v2/search.json?query=type:ticket status:closed created>...)
 * + Incremental API, paginando por cursor y respetando rate limits (429 -> retry-after).
 */
class MockHistoricalSource implements HistoricalSource {
  async fetchTickets(filtros: FiltrosImportacion): Promise<RawHistoricalTicket[]> {
    const base: RawHistoricalTicket[] = [
      {
        zendeskTicketId: "H-3001",
        subject: "Plato llegó roto",
        status: "closed",
        priority: "normal",
        type: "incident",
        channel: "email",
        groupId: "soporte",
        assigneeId: "ana.exp",
        requesterId: "cli-991",
        requesterName: "Carlos Martín",
        organizationId: "Reformas Center",
        tags: ["postventa", "transporte"],
        customFields: { satisfaccion: "good" },
        formId: "incidencias",
        inboundEmail: "sac@docciagroup.com",
        createdAt: "2026-02-10T09:00:00Z",
        solvedAt: "2026-02-11T12:00:00Z",
        updatedAt: "2026-02-11T12:00:00Z",
        comments: [
          {
            zendeskCommentId: "c1",
            authorId: "cli-991",
            authorRole: "cliente",
            isPublic: true,
            messageType: "public_customer_reply",
            bodyText:
              "Buenos días, soy Carlos Martín, mi email es carlos.martin@gmail.com. Me ha llegado el plato de ducha roto por una esquina. Mi teléfono es 612345678.",
            bodyHtml: null,
            createdAt: "2026-02-10T09:00:00Z",
          },
          {
            zendeskCommentId: "c2",
            authorId: "ana.exp",
            authorRole: "agente",
            isPublic: false,
            messageType: "internal_note",
            bodyText: "Parece daño de transporte. Pido evidencias antes de tramitar reposición.",
            bodyHtml: null,
            createdAt: "2026-02-10T09:30:00Z",
          },
          {
            zendeskCommentId: "c3",
            authorId: "ana.exp",
            authorRole: "agente",
            isPublic: true,
            messageType: "public_customer_reply",
            bodyText:
              "Buenos días, lamentamos la incidencia. Para tramitarla, envíenos por favor: fotografía del daño, fotografía de la etiqueta del embalaje y el número de pedido. En cuanto los recibamos gestionamos la reposición sin coste.",
            bodyHtml: null,
            createdAt: "2026-02-10T10:00:00Z",
          },
        ],
        sideConversations: [
          {
            zendeskSideConversationId: "sc1",
            subject: "Aviso incidencia transporte",
            participants: ["ana.exp", "logistica@docciagroup.com"],
            tipo: "logistica",
            status: "closed",
            bodyText: "Incidencia de rotura en pedido. Abrir reclamación con la agencia.",
            createdAt: "2026-02-10T10:05:00Z",
            updatedAt: "2026-02-10T16:00:00Z",
          },
        ],
      },
      {
        zendeskTicketId: "H-3002",
        subject: "¿Cuándo llega mi pedido?",
        status: "solved",
        priority: "low",
        type: "question",
        channel: "web",
        groupId: "soporte",
        assigneeId: "luis.exp",
        requesterId: "cli-992",
        requesterName: "Marta López",
        organizationId: null,
        tags: ["logistica"],
        customFields: { satisfaccion: "good" },
        formId: "consultas",
        inboundEmail: "sac@docciagroup.com",
        createdAt: "2026-03-01T11:00:00Z",
        solvedAt: "2026-03-01T11:20:00Z",
        updatedAt: "2026-03-01T11:20:00Z",
        comments: [
          {
            zendeskCommentId: "c1",
            authorId: "cli-992",
            authorRole: "cliente",
            isPublic: true,
            messageType: "public_customer_reply",
            bodyText: "Hola, hice un pedido hace 3 días, ¿cuándo me llega?",
            bodyHtml: null,
            createdAt: "2026-03-01T11:00:00Z",
          },
          {
            zendeskCommentId: "c2",
            authorId: "luis.exp",
            authorRole: "agente",
            isPublic: true,
            messageType: "public_customer_reply",
            bodyText:
              "Hola Marta, el plazo estándar es de 5 a 7 días laborables y recibirás un email con el número de seguimiento en cuanto salga de almacén. ¿Quieres que te confirme el estado actual de tu pedido?",
            bodyHtml: null,
            createdAt: "2026-03-01T11:15:00Z",
          },
        ],
        sideConversations: [],
      },
    ];

    // Aplica filtros sencillos (estado, tags) sobre los datos mock.
    return base.filter((t) => {
      if (filtros.estado && t.status !== filtros.estado) return false;
      if (filtros.tags && filtros.tags.length && !filtros.tags.some((tag) => t.tags.includes(tag)))
        return false;
      if (filtros.grupo && t.groupId !== filtros.grupo) return false;
      if (filtros.agente && t.assigneeId !== filtros.agente) return false;
      return true;
    });
  }
}

// Campos custom de Zendesk
const CAMPO_DEPARTAMENTO = "10729681890845";
const SUBMOTIVO_POR_PREFIJO: Record<string, string> = {
  pedido:          "10729694772253",
  logistica:       "10729737760669",
  contract:        "10729738461981",
  administracion:  "10729752188957",
  postventa:       "11181433487261",
  plat_online:     "27224632800797",
  cliente:         "27224632800797",
  transporte:      "27224632800797",
};

function campoSubmotivoId(valor: string): string | null {
  const prefix = Object.keys(SUBMOTIVO_POR_PREFIJO).find(p => valor.startsWith(p + "_") || valor === p);
  return prefix ? SUBMOTIVO_POR_PREFIJO[prefix] : null;
}

class ZendeskHistoricalSource implements HistoricalSource {
  private auth(): string {
    const encoded = Buffer.from(`${config.zendesk.email}/token:${config.zendesk.apiToken}`).toString("base64");
    return `Basic ${encoded}`;
  }
  private url(path: string) {
    return `https://${config.zendesk.subdomain}.zendesk.com/api/v2${path}`;
  }

  private async cargarAgentIds(headers: Record<string, string>): Promise<Set<string>> {
    const ids = new Set<string>();
    let url: string | null = this.url("/users.json?role[]=agent&role[]=admin&per_page=100");
    while (url) {
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const page = await res.json() as { users: { id: number }[]; next_page: string | null };
      page.users.forEach(u => ids.add(String(u.id)));
      url = page.next_page ?? null;
    }
    return ids;
  }

  async fetchTickets(filtros: FiltrosImportacion): Promise<RawHistoricalTicket[]> {
    const partes: string[] = ["type:ticket"];
    const arr = (v: string | string[] | null | undefined) => v ? (Array.isArray(v) ? v : [v]) : [];

    arr(filtros.estado).forEach(v => partes.push(`status:${v}`));
    arr(filtros.prioridad).forEach(v => partes.push(`priority:${v}`));
    arr(filtros.grupo).forEach(v => partes.push(`group_id:${v}`));
    arr(filtros.agente).forEach(v => partes.push(`assignee_id:${v}`));
    arr(filtros.canal).forEach(v => partes.push(`via:${v}`));
    if (filtros.busqueda) partes.push(filtros.busqueda);
    if (filtros.tags?.length) filtros.tags.forEach(t => partes.push(`tags:${t}`));
    arr(filtros.departamento).forEach(v => partes.push(`custom_field_${CAMPO_DEPARTAMENTO}:${v}`));
    arr(filtros.submotivo).forEach(v => {
      const fieldId = campoSubmotivoId(v);
      if (fieldId) partes.push(`custom_field_${fieldId}:${v}`);
    });
    const marcas = arr(filtros.marca);
    if (marcas.includes("bellobath") && !marcas.includes("doccia")) partes.push("recipient:sac@bellobath.eu");
    if (marcas.includes("doccia") && !marcas.includes("bellobath")) partes.push("-recipient:sac@bellobath.eu");
    // Usar solved>= para tickets cerrados/resueltos (capta tickets creados antes del rango pero resueltos dentro)
    // updated>= como fallback para otros estados
    const estados = arr(filtros.estado);
    const filtrandoCerrados = estados.length === 0 || estados.some(e => e === "closed" || e === "solved");
    const campoFecha = filtrandoCerrados ? "solved" : "updated";
    if (filtros.fechaDesde) partes.push(`${campoFecha}>=${filtros.fechaDesde}`);
    if (filtros.fechaHasta) partes.push(`${campoFecha}<=${filtros.fechaHasta}`);

    const query = encodeURIComponent(partes.join(" "));
    const headers = { Authorization: this.auth(), "Content-Type": "application/json" };

    // Cargar lista de agentes una vez para determinar roles correctamente
    const agentIds = await this.cargarAgentIds(headers);

    const resultados: RawHistoricalTicket[] = [];
    let nextUrl: string | null = this.url(`/search.json?query=${query}&per_page=100&sort_by=created_at&sort_order=desc`);

    while (nextUrl) {
      const res = await fetch(nextUrl, { headers });
      if (!res.ok) {
        console.error("[historical] Zendesk search error", res.status, await res.text());
        break;
      }
      const data = await res.json() as { results: Record<string, unknown>[]; next_page: string | null };
      nextUrl = data.next_page ?? null;

      for (const t of data.results) {
        if ((t as Record<string, unknown>).result_type !== "ticket") continue;
        const raw = await this.enriquecerTicket(t, headers, agentIds);
        if (raw) resultados.push(raw);
      }
    }

    return resultados;
  }

  private async enriquecerTicket(
    t: Record<string, unknown>,
    headers: Record<string, string>,
    agentIds: Set<string>,
  ): Promise<RawHistoricalTicket | null> {
    try {
      const ticketId = String(t.id);
      const via = (t.via as Record<string, unknown>) ?? {};
      const viaSource = (via.source as Record<string, unknown>) ?? {};
      const viaTo = (viaSource.to as Record<string, unknown>) ?? {};

      // Datos del solicitante
      let requesterName: string | null = null;
      let requesterEmail: string | null = null;
      let requesterPhone: string | null = null;
      if (t.requester_id) {
        const ur = await fetch(this.url(`/users/${t.requester_id}.json`), { headers });
        if (ur.ok) {
          const { user } = await ur.json() as { user: Record<string, unknown> };
          requesterName  = user.name  ? String(user.name)  : null;
          requesterEmail = user.email ? String(user.email) : null;
          requesterPhone = user.phone ? String(user.phone) : null;
        }
      }

      // Datos de la organización
      let organizationName: string | null = null;
      if (t.organization_id) {
        const or = await fetch(this.url(`/organizations/${t.organization_id}.json`), { headers });
        if (or.ok) {
          const { organization } = await or.json() as { organization: Record<string, unknown> };
          organizationName = organization.name ? String(organization.name) : null;
        }
      }

      // Comentarios — todos (públicos + notas internas), con paginación
      const rawComments: Record<string, unknown>[] = [];
      let commentsUrl: string | null = this.url(`/tickets/${ticketId}/comments.json?per_page=100`);
      while (commentsUrl) {
        const cr = await fetch(commentsUrl, { headers });
        if (!cr.ok) break;
        const page = await cr.json() as { comments: Record<string, unknown>[]; next_page: string | null };
        rawComments.push(...page.comments);
        commentsUrl = page.next_page ?? null;
      }

      const comments: RawHistoricalComment[] = rawComments
        .map(c => {
          const authorId = c.author_id ? String(c.author_id) : null;
          const rawAttachments = Array.isArray(c.attachments) ? c.attachments as Record<string, unknown>[] : [];
          const attachments: RawAttachment[] = rawAttachments.map(a => ({
            zendeskAttachmentId: String(a.id),
            fileName: String(a.file_name ?? "adjunto"),
            contentType: String(a.content_type ?? "application/octet-stream"),
            size: Number(a.size ?? 0),
            contentUrl: String(a.content_url ?? ""),
          }));
          return {
            zendeskCommentId: String(c.id),
            authorId,
            authorRole: (authorId && agentIds.has(authorId) ? "agente" : "cliente") as "cliente" | "agente" | "sistema",
            isPublic: c.public === true,
            messageType: (c.public ? "public_customer_reply" : "internal_note") as MessageType,
            bodyText: String(c.body ?? ""),
            bodyHtml: null,
            attachments,
            createdAt: String(c.created_at ?? new Date().toISOString()),
          };
        });

      // Campos custom
      const customFields = Array.isArray(t.custom_fields)
        ? (t.custom_fields as { id: number; value: unknown }[])
        : [];
      const cfMap = Object.fromEntries(customFields.map(f => [String(f.id), f.value]));

      const recipient = t.recipient ? String(t.recipient) : (viaTo.address ? String(viaTo.address) : null);

      // Origen / trazabilidad
      const viaFrom = (viaSource.from as Record<string, unknown>) ?? {};
      const origenRel = viaSource.rel ? String(viaSource.rel) : null;
      const origenTicketId = viaFrom.ticket_id ? String(viaFrom.ticket_id) : null;
      const origenTicketTitulo = viaFrom.ticket_title ? String(viaFrom.ticket_title) : null;
      const origenCanal = via.channel ? String(via.channel) : null;
      const primeraRespuestaEsAgente = comments.length > 0 && comments[0].authorRole === "agente";

      return {
        zendeskTicketId: ticketId,
        subject: String(t.subject ?? "(sin asunto)"),
        status: String(t.status ?? ""),
        priority: t.priority ? String(t.priority) : null,
        type: t.type ? String(t.type) : null,
        channel: via.channel ? String(via.channel) : null,
        groupId: t.group_id ? String(t.group_id) : null,
        assigneeId: t.assignee_id ? String(t.assignee_id) : null,
        requesterId: t.requester_id ? String(t.requester_id) : null,
        requesterName,
        requesterEmail,
        requesterPhone,
        organizationId: t.organization_id ? String(t.organization_id) : null,
        organizationName,
        tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
        customFields: cfMap,
        formId: t.ticket_form_id ? String(t.ticket_form_id) : null,
        origenCanal,
        origenRel,
        origenTicketId,
        origenTicketTitulo,
        primeraRespuestaEsAgente,
        createdAt: String(t.created_at ?? new Date().toISOString()),
        solvedAt: t.solved_at ? String(t.solved_at) : null,
        updatedAt: t.updated_at ? String(t.updated_at) : null,
        comments,
        sideConversations: [],
        inboundEmail: recipient,
      };
    } catch (err) {
      console.error("[historical] error enriqueciendo ticket", t.id, err);
      return null;
    }
  }
}

export const historicalSource: HistoricalSource = zendeskConfigurado
  ? new ZendeskHistoricalSource()
  : new MockHistoricalSource();
export const usandoMockHistorico = !zendeskConfigurado;
