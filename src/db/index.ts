import { JsonStore } from "./json-store.js";
import type { Store } from "./store.js";

/**
 * Store activo de la aplicacion.
 * HOY: JsonStore — persistencia ligera en disco (data/kb.json, data/correcciones.json)
 *      para la base de conocimiento y las correcciones. El resto vive en memoria.
 * MAÑANA (BD real): crear una implementacion nueva y cambiar SOLO esta linea.
 */
export const store = new JsonStore();
export type { Store };
