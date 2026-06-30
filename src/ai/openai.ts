import OpenAI from "openai";
import { config, iaActiva } from "../config.js";

/**
 * Cliente OpenAI (ChatGPT) = motor de IA de Doccia AI.
 * Si no hay OPENAI_API_KEY, queda en null y el resto de modulos usan su modo demo.
 */
export const openai = iaActiva
  ? new OpenAI({ apiKey: config.openai.apiKey })
  : null;
