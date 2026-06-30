import { nanoid } from "nanoid";
import { store } from "../db/index.js";
import { historicalSource } from "../zendesk/historical-source.js";
import { anonimizar, anonimizarNombre } from "../zendesk/anonimizar.js";
import { analizarHistorico } from "../ai/analizador-historico.js";
import type {
  FiltrosImportacion,
  HistoricalComment,
  HistoricalSideConversation,
  HistoricalTicket,
  ImportJob,
  TrainingExample,
} from "../types.js";

/** Crea el job y lanza la importacion en segundo plano. Devuelve el job 'pending'. */
export async function lanzarImportacion(
  filtros: FiltrosImportacion,
  userId: string | null,
): Promise<ImportJob> {
  const job: ImportJob = {
    id: nanoid(),
    startedByUserId: userId,
    filters: filtros,
    status: "pending",
    totalTicketsFound: 0,
    totalTicketsImported: 0,
    totalCommentsImported: 0,
    totalSideConversationsImported: 0,
    errorsCount: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  await store.saveImportJob(job);
  void ejecutar(job.id, filtros); // en segundo plano
  return job;
}

async function ejecutar(jobId: string, filtros: FiltrosImportacion) {
  await store.updateImportJob(jobId, { status: "running" });
  let importados = 0;
  let comentarios = 0;
  let sideconvs = 0;
  let errores = 0;

  try {
    const tickets = await historicalSource.fetchTickets(filtros);
    await store.updateImportJob(jobId, { totalTicketsFound: tickets.length });

    for (const raw of tickets) {
      try {
        // Importacion incremental: no duplicar si ya esta.
        if (await store.existeHistoricalTicket(raw.zendeskTicketId)) continue;

        const ahora = new Date().toISOString();
        const ht: HistoricalTicket = {
          id: nanoid(),
          jobId,
          zendeskTicketId: raw.zendeskTicketId,
          subject: anonimizar(raw.subject),
          status: raw.status,
          priority: raw.priority,
          type: raw.type,
          channel: raw.channel,
          groupId: raw.groupId,
          assigneeId: raw.assigneeId,
          requesterId: raw.requesterId,
          requesterName: raw.requesterName ?? null,
          requesterEmail: raw.requesterEmail ?? null,
          requesterPhone: raw.requesterPhone ?? null,
          organizationId: raw.organizationId,
          organizationName: raw.organizationName ?? null,
          tags: raw.tags,
          customFields: raw.customFields,
          formId: raw.formId,
          inboundEmail: raw.inboundEmail ?? null,
          origenCanal: raw.origenCanal ?? null,
          origenRel: raw.origenRel ?? null,
          origenTicketId: raw.origenTicketId ?? null,
          origenTicketTitulo: raw.origenTicketTitulo ?? null,
          primeraRespuestaEsAgente: raw.primeraRespuestaEsAgente ?? false,
          createdAt: raw.createdAt,
          solvedAt: raw.solvedAt,
          updatedAt: raw.updatedAt,
          importedAt: ahora,
        };
        await store.saveHistoricalTicket(ht);
        importados++;

        for (const c of raw.comments) {
          const comentario: HistoricalComment = {
            id: nanoid(),
            zendeskCommentId: c.zendeskCommentId,
            zendeskTicketId: raw.zendeskTicketId,
            authorId: c.authorId,
            authorRole: c.authorRole,
            isPublic: c.isPublic,
            messageType: c.messageType,
            bodyText: anonimizarNombre(anonimizar(c.bodyText), raw.requesterName),
            bodyHtml: c.bodyHtml ? anonimizar(c.bodyHtml) : null,
            attachments: (c.attachments ?? []).map(a => ({
              zendeskAttachmentId: a.zendeskAttachmentId,
              fileName: a.fileName,
              contentType: a.contentType,
              size: a.size,
              localPath: null, // se descarga en refresh-comments, no durante importación inicial
            })),
            detectedLanguage: null, // se rellena en refresh-comments
            bodyTextEs: null,
            createdAt: c.createdAt,
            importedAt: ahora,
          };
          await store.saveHistoricalComment(comentario);
          comentarios++;
        }

        for (const s of raw.sideConversations) {
          const sc: HistoricalSideConversation = {
            id: nanoid(),
            zendeskSideConversationId: s.zendeskSideConversationId,
            zendeskTicketId: raw.zendeskTicketId,
            subject: anonimizar(s.subject),
            participants: s.participants,
            tipo: s.tipo,
            status: s.status,
            bodyText: anonimizar(s.bodyText),
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            importedAt: ahora,
          };
          await store.saveHistoricalSideConversation(sc);
          sideconvs++;
        }
      } catch (err) {
        console.error("[importador] error con ticket", raw.zendeskTicketId, err);
        errores++;
      }
    }

    await store.updateImportJob(jobId, {
      status: errores > 0 ? "partially_completed" : "completed",
      totalTicketsImported: importados,
      totalCommentsImported: comentarios,
      totalSideConversationsImported: sideconvs,
      errorsCount: errores,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[importador] fallo del job", err);
    await store.updateImportJob(jobId, {
      status: "failed",
      errorsCount: errores + 1,
      completedAt: new Date().toISOString(),
    });
  }
}

const CAMPO_DEPARTAMENTO_ID = "10729681890845";
const CAMPOS_SUBMOTIVO_IDS = ["10729694772253","10729737760669","10729738461981","10729752188957","11181433487261","27224632800797"];

function extraerDeptoSubmotivo(customFields: Record<string, unknown>): { departamento: string | null; submotivo: string | null } {
  const departamento = customFields[CAMPO_DEPARTAMENTO_ID] ? String(customFields[CAMPO_DEPARTAMENTO_ID]) : null;
  const submotivo = CAMPOS_SUBMOTIVO_IDS.map(id => customFields[id]).find(v => v != null && v !== "") ?? null;
  return { departamento, submotivo: submotivo != null ? String(submotivo) : null };
}

/** Analiza con IA los tickets importados por un job y crea ejemplos de entrenamiento. */
const CONCURRENCIA_ANALISIS = 10;

export async function analizarJob(jobId: string): Promise<{ creados: number }> {
  const tickets = await store.listHistoricalTickets(jobId);
  let creados = 0;

  // Procesar en lotes de CONCURRENCIA_ANALISIS para no saturar la API de OpenAI
  for (let i = 0; i < tickets.length; i += CONCURRENCIA_ANALISIS) {
    const lote = tickets.slice(i, i + CONCURRENCIA_ANALISIS);
    const resultados = await Promise.allSettled(
      lote.map(async (ht) => {
        const comentarios = await store.listHistoricalComments(ht.zendeskTicketId);
        const conversacion = [
          `Asunto: ${ht.subject}`,
          `Estado: ${ht.status} | Tags: ${ht.tags.join(", ") || "—"}`,
          "",
          ...comentarios.map(
            (c) => `[${c.authorRole}${c.isPublic ? "" : " (interno)"}] ${c.bodyText}`,
          ),
        ].join("\n");

        const a = await analizarHistorico(conversacion);
        const { departamento, submotivo } = extraerDeptoSubmotivo(ht.customFields);

        const ejemplo: TrainingExample = {
          id: nanoid(),
          sourceType: "historico",
          sourceTicketId: ht.zendeskTicketId,
          sourceCommentId: null,
          category: a.category,
          customerMessage: a.customerMessage,
          contextSummary: a.contextSummary,
          humanResponse: a.humanResponse,
          internalReasoningSummary: a.internalReasoningSummary,
          tags: a.tags,
          qualityScore: a.qualityScore,
          buenEjemplo: a.buenEjemplo,
          reglaPropuesta: a.reglaPropuesta,
          status: "pendiente",
          approvedForTraining: false,
          createdAt: new Date().toISOString(),
          ticketStatus: ht.status ?? null,
          ticketPriority: ht.priority ?? null,
          ticketChannel: ht.channel ?? null,
          ticketGroupId: ht.groupId ?? null,
          ticketAssigneeId: ht.assigneeId ?? null,
          ticketDepartamento: departamento,
          ticketSubmotivo: submotivo,
          ticketInboundEmail: ht.inboundEmail ?? null,
          importJobId: jobId,
        };
        await store.saveTrainingExample(ejemplo);
        return 1;
      }),
    );
    for (const r of resultados) {
      if (r.status === "fulfilled") creados++;
      else console.error("[analizarJob] error en ticket:", r.reason);
    }
  }
  return { creados };
}
