---
name: project-context
description: >
  Generate and maintain permanent project context documentation in docs/context/.
  Use whenever the user says "generate project context", "update the context docs",
  "document the project", "create project documentation", "what is this project",
  "explain the project structure", "I want Claude to understand the project",
  "write the project knowledge base", or starts a new major task and the docs/context/
  directory is missing or outdated. Also use proactively when beginning work on a
  complex feature where understanding the full project is essential.
---

# Project Context

Reads the codebase and writes eight living documents to `docs/context/`. These files
are the permanent memory of the project — Claude reads them at the start of sessions
instead of re-deriving everything from scratch. Keep them accurate and up to date.

## Output

Create `docs/context/` if it doesn't exist. Write all eight files:

| File | What to capture |
|---|---|
| `PROJECT_OVERVIEW.md` | What the project does, why it exists, who uses it, current status, key decisions made |
| `ARCHITECTURE.md` | System layers, component responsibilities, data flow, integration points |
| `FOLDER_STRUCTURE.md` | Every top-level folder and key files — one line each explaining real purpose |
| `TECH_STACK.md` | Languages, frameworks, databases, external services, and why each was chosen |
| `BUSINESS_RULES.md` | Domain logic, validation rules, edge cases, constraints the code must respect |
| `CODING_STANDARDS.md` | Patterns actually used (not aspirational), naming conventions, error handling style |
| `DOMAIN_MODEL.md` | Core entities, their fields, relationships, and lifecycle states |
| `API_REFERENCE.md` | All endpoints or interfaces: method, path/name, inputs, outputs, side effects |

## Process

Read the actual files before writing — don't infer from folder names or the README alone.
Work through the codebase in this order:

1. **Entry points** — `app.py`, `server.ts`, `main.py`, or equivalent. Understand what starts.
2. **Models / types** — `database/models.py`, `src/types.ts`, or equivalent. Map the domain.
3. **Services / business logic** — the layer that does the real work.
4. **Views / routes / API** — what is exposed to the user or external systems.
5. **Config and manifests** — `requirements.txt`, `package.json`, `.env.example`.
6. **Existing docs** — `README.md`, any files in `docs/`.

Read enough of each file to understand its actual responsibility, not just its name.

## Writing guidelines

Each document should be useful to a developer who has never seen the project.
Prefer concrete facts over general statements:

> ✅ `views/auditoria.py` — Streamlit page that loads invoice lines from SQLite,
>    applies tariff calculations via `services/tariff_engine.py`, and displays
>    differences with colour-coded status badges.
>
> ❌ "The audit view shows invoice data."

Capture decisions and constraints that are not obvious from reading the code:
- Why a particular approach was chosen over alternatives
- Known limitations or workarounds
- Things that look wrong but are intentional

## Keeping docs current

When the skill runs on a project that already has `docs/context/`, compare the existing
files against the current codebase and update only what has changed. Note the date of
the last update at the top of each file:

```markdown
> Last updated: YYYY-MM-DD
```

This makes it easy to know whether the context is fresh or stale.

## What Claude does with these docs

These files exist so that at the start of any complex task, Claude can read
`docs/context/` instead of exploring the whole codebase from scratch. A future
Claude instance reading `PROJECT_OVERVIEW.md` should immediately understand what
the project is. Reading `BUSINESS_RULES.md` should surface constraints before
writing code that would violate them. Reading `DOMAIN_MODEL.md` should clarify
entity relationships before touching the database layer.

Write them as if briefing a capable developer who is joining the project today.
