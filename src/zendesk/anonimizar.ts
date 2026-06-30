/**
 * Anonimiza datos personales antes de guardar el historico para entrenamiento.
 * Mantiene nombres de empresa (utiles para contexto comercial). No es perfecto:
 * es una primera capa por patrones. Revisar antes de usar en produccion seria.
 */
export function anonimizar(texto: string): string {
  if (!texto) return texto;
  let t = texto;

  // Emails
  t = t.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[EMAIL]");
  // IBAN (ES + 22 digitos aprox)
  t = t.replace(/\b[A-Z]{2}\d{2}[\s]?(?:\d[\s]?){10,30}\b/g, "[IBAN]");
  // Telefonos: secuencias con 9+ digitos (admite +, espacios, puntos, guiones)
  t = t.replace(/\+?\d[\d\s.\-]{7,}\d/g, (m) =>
    m.replace(/\D/g, "").length >= 9 ? "[TELEFONO]" : m,
  );
  // NIF / DNI / NIE
  t = t.replace(/\b[XYZ]?\d{7,8}[-\s]?[A-Z]\b/gi, "[DOC_ID]");
  // Codigos postales + direccion basica (calle/avda ... numero)
  t = t.replace(/\b(c\/|calle|avda\.?|avenida|plaza|paseo)\s+[^\n,.]{3,40}\b/gi, "[DIRECCION]");

  return t;
}

/** Anonimiza un nombre de persona conocido (lo sustituye por un placeholder). */
export function anonimizarNombre(texto: string, nombre?: string | null): string {
  if (!nombre) return texto;
  const limpio = nombre.trim();
  if (limpio.length < 3) return texto;
  return texto.split(limpio).join("[CLIENTE]");
}
