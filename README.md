# Doccia AI

Empleado virtual de atención al cliente para Doccia Group, integrado con Zendesk.
**Motor de IA: OpenAI (ChatGPT).** Persistencia: store **mock en memoria** (de mentira)
mientras decidimos la base de datos real.

> Construido con asistencia de Claude Code. El motor que ejecuta la app en producción es OpenAI.

## Qué hace (Fase 1 — MVP, Modo Seguro)

Flujo: `Cliente → Zendesk → IA → Borrador → Agente humano → Enviar`.
La IA **nunca** responde sola: solo deja borradores para revisión humana.

1. Recibe el ticket (webhook de Zendesk o datos de ejemplo del mock).
2. **Clasifica** (categoría, intención, urgencia, enfado, riesgo, confianza) — `gpt-4o-mini`.
3. **Reglas de seguridad**: escala casos delicados (reclamación, legal, enfado alto, confianza baja).
4. **Recupera** documentación interna relevante (KB).
5. **Genera** un borrador con el tono Doccia — `gpt-4o`.
6. **Panel web** para aprobar / editar / rechazar / regenerar, y registra las correcciones.

## Arranque rápido

```bash
cd doccia-ai
npm install
cp .env.example .env      # opcional: añade OPENAI_API_KEY para IA real
npm run dev
```

Abre http://localhost:3000 — verás el panel con 3 tickets de ejemplo ya procesados.

> **Sin `OPENAI_API_KEY`** la app arranca igual en **modo demo offline**: clasificador
> por heurística y borrador de plantilla. Pon la clave para respuestas reales de ChatGPT.

## Estructura

```
src/
├── config.ts            # variables de entorno
├── types.ts             # tipos de dominio (= futuras tablas de la BD)
├── db/                  # PERSISTENCIA
│   ├── store.ts         # interfaz unica (todo el codigo habla solo con esto)
│   ├── mock-store.ts    # implementacion en memoria (de mentira)
│   ├── index.ts         # store activo — cambiar 1 linea para la BD real
│   └── seed.ts          # datos de ejemplo
├── ai/                  # MOTOR OpenAI
│   ├── openai.ts        # cliente
│   ├── clasificador.ts  # GPT-4o mini + structured outputs (+ demo offline)
│   ├── generador.ts     # GPT-4o (+ demo offline)
│   └── prompts.ts       # tono Doccia
├── kb/recuperador.ts    # recuperacion KB (mock por palabras; pgvector en el futuro)
├── seguridad/reglas.ts  # escalado obligatorio
├── pipeline/procesar-ticket.ts   # orquesta los 6 pasos
├── zendesk/             # webhook + cliente (stub)
├── api/routes.ts        # endpoints del panel
└── server.ts            # arranque Fastify + panel estatico
panel/index.html         # panel de revision (sin build, vanilla JS)
```

## Probar el webhook (simular Zendesk)

```bash
curl -X POST http://localhost:3000/webhooks/zendesk \
  -H "Content-Type: application/json" \
  -d '{"asunto":"No me llega el pedido","cliente_nombre":"Ana","mensaje":"Hice un pedido hace 10 dias y no llega"}'
```

## Próximos pasos

- **Base de datos real**: implementar otra clase `Store` y cambiar 1 línea en `db/index.ts`.
  Con BD: RAG real con embeddings (`text-embedding-3-small`) + búsqueda vectorial.
- **Zendesk real**: completar `zendesk/client.ts` (API) y la verificación de firma del webhook.
- **Fase 2**: auto-respuesta configurable para casos simples (con las guardas de seguridad).
- **Fase 3**: agentes especializados (Soporte / Comercial / Técnico / Postventa).
```
