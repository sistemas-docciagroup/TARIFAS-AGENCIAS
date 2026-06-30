import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config, iaActiva } from "./config.js";
import { registrarApi } from "./api/routes.js";
import { registrarWebhooks } from "./zendesk/webhooks.js";
import { seed } from "./db/seed.js";
import { procesarTicket } from "./pipeline/procesar-ticket.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({ logger: true });

  // Soporte para subida de archivos (limite 20 MB por archivo)
  await app.register(fastifyMultipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  // Panel web estatico en /
  await app.register(fastifyStatic, {
    root: join(__dirname, "..", "panel"),
    prefix: "/",
  });

  registrarApi(app);
  registrarWebhooks(app);

  // Cargamos los datos de ejemplo (rapido: solo inserta en el store).
  const ticketIds = await seed();

  // Arrancamos a escuchar YA, sin esperar a la IA.
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(
    `Doccia AI en http://localhost:${config.port}  |  Motor IA: ${
      iaActiva ? "OpenAI (ChatGPT)" : "DEMO offline (sin OPENAI_API_KEY)"
    }`,
  );

  // Procesamos los tickets de ejemplo EN SEGUNDO PLANO (las llamadas a GPT-5.5
  // pueden tardar). Los borradores van apareciendo en el panel segun se generan.
  void (async () => {
    for (const id of ticketIds) {
      try {
        await procesarTicket(id);
        app.log.info(`Ticket de ejemplo procesado: ${id}`);
      } catch (err) {
        app.log.error({ err, id }, "Error procesando ticket de ejemplo");
      }
    }
    app.log.info("Tickets de ejemplo procesados.");
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
