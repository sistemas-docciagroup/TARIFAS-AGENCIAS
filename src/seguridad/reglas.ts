import { config } from "../config.js";
import type { Analisis } from "../types.js";

export interface ResultadoSeguridad {
  escalar: boolean;
  regla: string | null;
  detalle: string | null;
}

/**
 * Determina si un ticket DEBE escalar a un humano (nunca auto-responder).
 * En Fase 1 todo lo revisa un humano igualmente, pero esto marca el caso en
 * rojo en el panel y deja la logica lista para la auto-respuesta de Fase 2.
 */
export function evaluarSeguridad(analisis: Analisis): ResultadoSeguridad {
  if (analisis.riesgo >= 0.7) {
    return {
      escalar: true,
      regla: "riesgo_alto",
      detalle: `Riesgo ${analisis.riesgo.toFixed(2)}: posible reclamacion grave, amenaza legal, conflicto comercial, descuento especial o excepcion de garantia.`,
    };
  }
  if (analisis.enfado >= config.seguridad.umbralEnfado) {
    return {
      escalar: true,
      regla: "enfado_alto",
      detalle: `Enfado ${analisis.enfado.toFixed(2)} por encima del umbral ${config.seguridad.umbralEnfado}.`,
    };
  }
  if (analisis.confianza < config.seguridad.umbralConfianza) {
    return {
      escalar: true,
      regla: "confianza_baja",
      detalle: `Confianza ${analisis.confianza.toFixed(2)} por debajo del umbral ${config.seguridad.umbralConfianza}.`,
    };
  }
  return { escalar: false, regla: null, detalle: null };
}
