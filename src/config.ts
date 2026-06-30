import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    modeloClasificador: process.env.OPENAI_MODEL_CLASIFICADOR ?? "gpt-5.5",
    modeloGenerador: process.env.OPENAI_MODEL_GENERADOR ?? "gpt-5.5",
  },

  zendesk: {
    subdomain: process.env.ZENDESK_SUBDOMAIN ?? "",
    email: process.env.ZENDESK_EMAIL ?? "",
    apiToken: process.env.ZENDESK_API_TOKEN ?? process.env.ZENDESK_TOKEN ?? "",
    webhookSecret: process.env.ZENDESK_WEBHOOK_SECRET ?? "",
  },

  seguridad: {
    umbralConfianza: Number(process.env.UMBRAL_CONFIANZA ?? 0.6),
    umbralEnfado: Number(process.env.UMBRAL_ENFADO ?? 0.7),
  },
};

/** ¿Tenemos motor de IA real configurado? Si no, se usa el modo demo offline. */
export const iaActiva = config.openai.apiKey.length > 0;
