import { config } from "../config.js";

const zendeskConfigurado =
  !!config.zendesk.subdomain && !!config.zendesk.email && !!config.zendesk.apiToken;

export function authHeader() {
  const encoded = Buffer.from(`${config.zendesk.email}/token:${config.zendesk.apiToken}`).toString("base64");
  return { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" };
}

export function zdUrl(path: string) {
  return `https://${config.zendesk.subdomain}.zendesk.com/api/v2${path}`;
}

export interface ZendeskTicketData {
  id: string;
  asunto: string;
  estado: string;
  prioridad: string | null;
  etiquetas: string[];
  clienteNombre: string;
  clienteEmail: string;
  empresa: string | null;
  canal: string;
  // Campos enriquecidos de Zendesk
  assigneeId: string | null;
  groupId: string | null;
  requesterId: string | null;
  organizationId: string | null;
  canalEntrada: string | null;
  emailEntrada: string | null;
  formId: string | null;
  departamento: string | null;
  submotivo: string | null;
  mensajes: { autor: "cliente" | "agente"; texto: string; creadoEn: string }[];
}

export async function obtenerTicketZendesk(zendeskId: string): Promise<ZendeskTicketData | null> {
  if (!zendeskConfigurado) return null;

  const [ticketRes, commentsRes] = await Promise.all([
    fetch(zdUrl(`/tickets/${zendeskId}.json`), { headers: authHeader() }),
    fetch(zdUrl(`/tickets/${zendeskId}/comments.json`), { headers: authHeader() }),
  ]);

  if (!ticketRes.ok) return null;

  const { ticket } = await ticketRes.json() as { ticket: Record<string, unknown> };
  const { comments } = commentsRes.ok
    ? await commentsRes.json() as { comments: Record<string, unknown>[] }
    : { comments: [] };

  // Resolver nombre y email del solicitante
  let clienteNombre = "Cliente";
  let clienteEmail = "";
  let empresa: string | null = null;

  if (ticket.requester_id) {
    const userRes = await fetch(zdUrl(`/users/${ticket.requester_id}.json`), { headers: authHeader() });
    if (userRes.ok) {
      const { user } = await userRes.json() as { user: Record<string, unknown> };
      clienteNombre = String(user.name ?? "Cliente");
      clienteEmail = String(user.email ?? "");
      empresa = user.organization_id ? null : null; // se puede enriquecer más adelante
    }
  }

  // Extraer departamento y submotivo de campos personalizados
  const CAMPO_DEPARTAMENTO = "10729681890845";
  const CAMPOS_SUBMOTIVO = ["10729694772253","10729737760669","10729738461981","10729752188957","11181433487261","27224632800797"];
  const customFields = Array.isArray(ticket.custom_fields) ? (ticket.custom_fields as { id: number; value: unknown }[]) : [];
  const campoMap = Object.fromEntries(customFields.map(f => [String(f.id), f.value]));
  const departamento = campoMap[CAMPO_DEPARTAMENTO] ? String(campoMap[CAMPO_DEPARTAMENTO]) : null;
  const submotivo = CAMPOS_SUBMOTIVO.map(id => campoMap[id]).find(v => v != null && v !== "") ?? null;

  // Solo mensajes públicos, el primero del cliente como mensaje principal
  const mensajes = (comments as Record<string, unknown>[])
    .filter((c) => c.public)
    .map((c) => ({
      autor: (c.author_id === ticket.requester_id ? "cliente" : "agente") as "cliente" | "agente",
      texto: String(c.body ?? "").slice(0, 1000),
      creadoEn: String(c.created_at ?? new Date().toISOString()),
    }));

  const via = (ticket.via as Record<string, unknown>) ?? {};
  const viaSource = (via.source as Record<string, unknown>) ?? {};
  const viaTo = (viaSource.to as Record<string, unknown>) ?? {};

  return {
    id: String(ticket.id),
    asunto: String(ticket.subject ?? "(sin asunto)"),
    estado: String(ticket.status ?? "nuevo"),
    prioridad: ticket.priority ? String(ticket.priority) : null,
    etiquetas: Array.isArray(ticket.tags) ? (ticket.tags as string[]) : [],
    clienteNombre,
    clienteEmail,
    empresa,
    canal: "clientes",
    assigneeId: ticket.assignee_id ? String(ticket.assignee_id) : null,
    groupId: ticket.group_id ? String(ticket.group_id) : null,
    requesterId: ticket.requester_id ? String(ticket.requester_id) : null,
    organizationId: ticket.organization_id ? String(ticket.organization_id) : null,
    canalEntrada: via.channel ? String(via.channel) : null,
    emailEntrada: ticket.recipient ? String(ticket.recipient) : (viaTo.address ? String(viaTo.address) : null),
    formId: ticket.ticket_form_id ? String(ticket.ticket_form_id) : null,
    departamento,
    submotivo: submotivo != null ? String(submotivo) : null,
    mensajes,
  };
}

export async function enviarRespuestaZendesk(
  zendeskTicketId: string,
  texto: string,
): Promise<void> {
  if (!zendeskConfigurado) {
    console.log(`[zendesk:stub] Respuesta para ticket ${zendeskTicketId}:\n${texto}\n`);
    return;
  }
  // TODO: implementar envío real cuando se active el modo live
  console.log(`[zendesk] Enviar respuesta real al ticket ${zendeskTicketId} (pendiente de implementar).`);
}
