# CLAUDE.md — Doccia AI

Guía de configuración de Claude Code para este proyecto.

## Plugin requerido: Ponytail

Este proyecto usa [Ponytail](https://github.com/DietrichGebert/ponytail) para mantener el código mínimo y eficiente. Ya está habilitado en `.claude/settings.json`, pero cada desarrollador debe instalarlo una vez en su máquina:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

**Qué hace:** Antes de escribir código, aplica la escalera YAGNI — ¿necesita existir? ¿ya existe? ¿lo hace la stdlib? ¿cabe en una línea? Solo entonces escribe el mínimo que funciona.

**Comandos disponibles:**
- `/ponytail [lite|full|ultra|off]` — cambia la intensidad
- `/ponytail-review` — revisa el diff actual en busca de sobre-ingeniería
- `/ponytail-audit` — audita el repo completo

## Proyecto

Sistema de gestión de tarifas de transporte para Doccia Group. Integrado con Zendesk. Motor de IA: OpenAI.

## Arranque

```bash
npm install
cp .env.example .env   # añade OPENAI_API_KEY
npm run dev
```
