import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentoKB } from "../types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MD_FILE = join(ROOT, "knowledge-base.md");

export function sincronizarKbMd(docs: DocumentoKB[]): void {
  const secciones: Record<string, DocumentoKB[]> = {};
  for (const doc of docs) {
    const key = doc.dominio ?? "GLOBAL";
    if (!secciones[key]) secciones[key] = [];
    secciones[key].push(doc);
  }

  let md = `# Base de Conocimiento — Doccia AI\n\n`;
  md += `> Dominios: GLOBAL | DOCCIA_CLIENTES | DOCCIA_COMERCIAL | BELLOBATH | SAP | HISTORICOS | CASOS_APRENDIDOS\n\n---\n\n`;

  for (const [dominio, items] of Object.entries(secciones)) {
    if (!items.length) continue;
    md += `## ${dominio}\n\n`;
    for (const doc of items) {
      md += `### ${doc.titulo}\n`;
      md += `**Tipo:** ${doc.tipo} | **Categoría:** ${doc.categoria} | **Acceso:** ${doc.nivelAcceso} | **Estado:** ${doc.status}\n\n`;
      if (doc.descripcion) md += `*${doc.descripcion}*\n\n`;
      md += `${doc.texto}\n\n---\n\n`;
    }
  }

  writeFileSync(MD_FILE, md, "utf-8");
}
