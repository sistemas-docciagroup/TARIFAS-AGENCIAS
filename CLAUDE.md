# CLAUDE.md — Doccia AI

Project setup guide for Claude Code.

## Development standard: Ponytail (strict YAGNI)

**All development in this project — new features, bug fixes, and evolutionary changes — must follow the `ponytail` skill criteria without exception.**

Before writing any code, apply the YAGNI ladder in order:
1. Does it need to exist? → Can the goal be achieved without new code?
2. Does it already exist in the codebase? → Check `normalizer.py`, `base_parser.py`, `services/` first
3. Does the stdlib cover it? → Before adding dependencies
4. Can it fit in one line? → A readable one-liner always wins
5. Only then: write the minimum that works — not the most general, not the most extensible

The skill is available at `.claude/skills/ponytail/`. Commands:
- `/ponytail [lite|full|ultra|off]` — change intensity
- `/ponytail-review` — review current diff for over-engineering
- `/ponytail-audit` — audit the full repo

### Optional plugin (install once per machine)

The Ponytail plugin complements the skill with automatic activation on every response:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

## Project

Transport rate audit system for Doccia Group. AI engine: OpenAI (GPT-4o Vision).

## Start

```bash
py -3.14 -m pip install -r requirements.txt
cp .env.example .env   # add OPENAI_API_KEY
py -3.14 -m streamlit run app.py
```
