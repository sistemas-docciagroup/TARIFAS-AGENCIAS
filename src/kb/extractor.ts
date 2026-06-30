/**
 * Extrae texto plano de distintos formatos de archivo para guardarlo en la KB.
 * Soporta: PDF, Excel (.xlsx/.xls), Word (.docx), CSV y texto plano.
 */

export type FormatoSoportado = "pdf" | "xlsx" | "xls" | "docx" | "csv" | "txt";

export interface ResultadoExtraccion {
  texto: string;
  tituloSugerido: string;
}

export function detectarFormato(nombreArchivo: string): FormatoSoportado | null {
  const ext = nombreArchivo.split(".").pop()?.toLowerCase() ?? "";
  const soportados: FormatoSoportado[] = ["pdf", "xlsx", "xls", "docx", "csv", "txt"];
  return soportados.includes(ext as FormatoSoportado) ? (ext as FormatoSoportado) : null;
}

export async function extraerTexto(
  buffer: Buffer,
  nombreArchivo: string,
): Promise<ResultadoExtraccion> {
  const formato = detectarFormato(nombreArchivo);
  const tituloSugerido = nombreArchivo.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  if (!formato) {
    throw new Error(
      `Formato no soportado: ${nombreArchivo}. Usa PDF, Excel (.xlsx/.xls), Word (.docx), CSV o TXT.`,
    );
  }

  let texto: string;
  switch (formato) {
    case "pdf":   texto = await extraerPdf(buffer); break;
    case "xlsx":
    case "xls":   texto = await extraerExcel(buffer); break;
    case "docx":  texto = await extraerDocx(buffer); break;
    case "csv":   texto = extraerCsv(buffer); break;
    case "txt":   texto = buffer.toString("utf-8").trim(); break;
  }

  return { texto: limpiar(texto), tituloSugerido };
}

async function extraerPdf(buffer: Buffer): Promise<string> {
  // pdf-parse es CJS; usamos dynamic import que en Node resuelve el default correctamente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("pdf-parse") as any;
  const pdfParse = mod.default ?? mod;
  const result = await pdfParse(buffer) as { text: string };
  return result.text;
}

async function extraerExcel(buffer: Buffer): Promise<string> {
  // xlsx puede ser CJS o ESM segun version; dynamic import funciona en ambos casos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("xlsx") as any;
  const XLSX = mod.default ?? mod;

  const wb = XLSX.read(buffer, { type: "buffer" }) as import("xlsx").WorkBook;
  const partes: string[] = [];
  for (const nombre of wb.SheetNames) {
    const hoja = wb.Sheets[nombre];
    const csv = XLSX.utils.sheet_to_csv(hoja) as string;
    if (csv.trim()) partes.push(`[Hoja: ${nombre}]\n${csv}`);
  }
  return partes.join("\n\n");
}

async function extraerDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function extraerCsv(buffer: Buffer): string {
  return buffer.toString("utf-8");
}

function limpiar(texto: string): string {
  return texto
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
