import { store } from "../db/index.js";
import type { Canal, DocumentoKB, Mensaje, Ticket } from "../types.js";

/**
 * Recupera documentos de la KB relevantes para una consulta, FILTRANDO por canal:
 * cada bot ve los documentos "compartido" + los de su propio canal.
 * (Version mock por palabras clave; con BD real se sustituye por busqueda vectorial.)
 */
export async function recuperarKbPorTexto(
  consulta: string,
  canal: Canal,
  maxResultados = 3,
): Promise<DocumentoKB[]> {
  const todos = await store.listKb();
  // Dominios transversales: accesibles por todos los chatboxes activos
  const COMPARTIDOS = ["GLOBAL", "ESTILO", "PLANTILLAS", "CASOS_APRENDIDOS"] as const;

  const visibles = todos.filter((d) => {
    if (d.status !== "activo") return false;
    // Bellobath es marca independiente: ve sus propios docs + compartidos (sin historial Doccia)
    if (canal === "bellobath")
      return d.dominio === "BELLOBATH" || (COMPARTIDOS as readonly string[]).includes(d.dominio);
    // Doccia clientes: GLOBAL + propios + compartidos + histórico
    if (canal === "clientes")
      return [...COMPARTIDOS, "DOCCIA_CLIENTES", "HISTORICOS"].includes(d.dominio as string);
    // Doccia comerciales: GLOBAL + propios + compartidos + histórico
    if (canal === "comerciales")
      return [...COMPARTIDOS, "DOCCIA_COMERCIAL", "HISTORICOS"].includes(d.dominio as string);
    return true;
  });
  if (visibles.length === 0) return [];

  const palabras = tokenizar(consulta);
  return visibles
    .map((doc) => ({ doc, score: solapamiento(palabras, tokenizar(doc.texto + " " + doc.titulo)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResultados)
    .map((x) => x.doc);
}

/** Atajo para tickets: usa el asunto + mensajes y el canal del propio ticket. */
export async function recuperarKb(
  ticket: Ticket,
  mensajes: Mensaje[],
  maxResultados = 3,
): Promise<DocumentoKB[]> {
  const consulta = `${ticket.asunto} ${mensajes.map((m) => m.texto).join(" ")}`;
  return recuperarKbPorTexto(consulta, ticket.canal, maxResultados);
}

function tokenizar(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function solapamiento(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}
