---
name: ponytail
description: >
  Lazy senior dev mode — apply YAGNI before writing any code. Use whenever the user
  says "ponytail", "keep it minimal", "yagni", "don't over-engineer", "lazy mode",
  "lite", "full", "ultra", or asks to review code for over-engineering. Also activate
  proactively before implementing any new feature, adding a dependency, creating a new
  file, or writing a function that might already exist somewhere — even if the user
  does not explicitly ask for it. When in doubt, less code is better code.
---

# Ponytail — Lazy Senior Dev Mode

Before writing code, run the YAGNI ladder. Before reviewing code, run it in reverse.

---

## The YAGNI Ladder

Ask these questions in order. Stop as soon as you find a "yes".

```
1. Does it need to exist at all?
   → Can the goal be achieved without any new code?

2. Does it already exist in this codebase?
   → Search before creating. In this project: check normalizer.py,
     base_parser.py, agency_meta.py, and the services/ layer first.

3. Does the standard library do it?
   → Python: collections, itertools, functools, pathlib, datetime, re.
     Before reaching for pandas for a 10-row dict, check if a list comprehension works.

4. Can it fit in one line?
   → A one-liner that is readable is always better than a function.

5. Write the minimum that works.
   → Not the most general. Not the most extensible. The minimum for the current need.
```

If you reach step 5, write code. Not before.

---

## Modes

### `/ponytail` or `/ponytail full` — Default

Apply the full YAGNI ladder to everything in the current task. If you are about to:
- Create a new file → ask if it belongs in an existing one
- Add a dependency → check if the stdlib or an already-installed package covers it
- Write a helper function → grep for it first
- Add a parameter → check if it can be derived from existing ones

### `/ponytail lite`

Apply only step 1 (does it need to exist?) and step 5 (minimum that works). Don't
search for existing implementations — assume the user has already checked. Still:
no abstractions that aren't needed yet, no optional parameters for hypothetical callers.

### `/ponytail ultra`

Apply the full ladder AND review existing code touched by the task. If implementing
a feature requires reading a function, and that function is longer than it needs to be,
flag it. Ultra mode surfaces opportunities to delete code, not just avoid adding it.

### `/ponytail off`

Disable Ponytail for the rest of the session. Write code normally without applying
the ladder. Use when prototyping fast, exploring unknown territory, or the user
explicitly wants more structure than the minimum.

---

## `/ponytail-review` — Review current diff

Read the staged or recently changed files and evaluate them against the YAGNI ladder.
For each file or function, answer:

- Could this have been avoided entirely?
- Is this already covered somewhere else in the codebase?
- Is there a stdlib equivalent?
- Could this be shorter without losing clarity?
- Are there parameters, class attributes, or abstractions that no current caller uses?

Report findings grouped by severity:

**Remove** — code that should not exist at all (dead code, duplicate of existing utility)  
**Simplify** — code that works but is longer than it needs to be  
**Watch** — premature abstractions that are harmless now but risky if they grow  

---

## `/ponytail-audit` — Audit the repo

Apply the YAGNI ladder to the full codebase, not just recent changes. Focus on:

- Functions defined but never called outside their own file
- Parameters that are always called with the same value
- Classes with one method (consider a plain function)
- Utility functions that duplicate something in `normalizer.py` or the stdlib
- Files under 30 lines that could be merged into their caller

This is a read-only analysis. Output a ranked list of removal candidates with file,
line, and a one-sentence reason. The user decides what to act on.

---

## Ponytail in this project

This codebase has specific patterns worth knowing before adding anything:

- **`normalizer.py`** — check here first for any string/number/date parsing utility
- **`parsers/base_parser.py`** — `safe_float()`, `safe_int()`, `safe_date()` already exist
- **`parsers/agency_meta.py`** — agency keywords, status, column definitions live here; don't hardcode them elsewhere
- **`services/tariff_engine.py`** — new tariff types get a `_agency_tipo()` private function, not a new file
- **`requirements.txt`** has `pandas`, `pdfplumber`, `PyMuPDF`, `openpyxl`, `plotly`, `sqlalchemy` — use what's already installed

Common over-engineering patterns found in this repo (from the audit):
- `_norm()` defined three times instead of once in `normalizer.py` — the cost of not checking first
- `_build_report_excel()` in a view instead of `exports/exporter.py` — a 156-line function that duplicated an existing layer
- Three unused dependencies in `requirements.txt` — added speculatively, never needed

Use these as anchors when deciding whether something really needs to exist.
