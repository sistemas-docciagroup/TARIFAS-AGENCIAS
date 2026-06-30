---
name: project-audit
description: >
  Full codebase audit. Use whenever the user says "audit the project", "find dead code",
  "find duplicates", "unused dependencies", "orphan files", "review the architecture",
  "technical debt", "code health report", "what can we clean up", "is everything well
  organized", or asks for any kind of codebase health analysis — even if they don't use
  the word "audit". Produces five reports in docs/audit/.
---

# Project Audit

## Overview

Full static analysis of the codebase. Reads every file, traces imports and references,
and writes five report documents to `docs/audit/`. The goal is to give the team an honest
picture of the actual state of the code — no inferring, no assuming, only what is really there.

## Process

Run each analysis in order and write findings as you go. Don't wait until the end:
writing while you advance helps you not lose context between sections.

### 1. Map the structure

Walk the full directory tree. For each folder and file, ask yourself:
- What is its real responsibility?
- Does it make sense to be here?
- Are there redundant folders or misplaced files?

### 2. Detect dead code

For each source file, search for its exports, functions and classes across the rest of the project.
Flag as dead any symbol with zero references outside its own file.
Also note commented-out blocks longer than 5 lines — they're usually code nobody dared to delete.

### 3. Detect duplicates

Look for:
- Files with identical or near-identical content under different names
- Utility functions defined in more than one place
- Copy-pasted code blocks (50+ lines that appear more than once)

If two places do the same thing, one of them is unnecessary.

### 4. Find orphan files

Files that are never imported and never referenced in config, routes or manifests:
- Source files with no inbound references
- Static assets not linked from HTML/CSS
- Config files superseded by a newer one

### 5. Unused dependencies

Cross-reference `requirements.txt` / `package.json` against actual imports in the source code.
Flag packages that appear in the manifest but are never imported.
Also flag imports in the code that are not declared in the manifest.

### 6. Review architecture

- Does the folder structure reflect the real responsibilities of the code?
- Are there circular imports or tight coupling between unrelated modules?
- Is there logic in the wrong layer? (e.g. DB queries inside views)
- Are naming conventions consistent?

### 7. Detect technical debt

- `TODO`, `FIXME`, `HACK`, `XXX`, `ponytail:` comments — list each one with file and line number
- Functions longer than 80 lines
- Files longer than 400 lines
- Hardcoded values that should be configuration
- Missing error handling at trust boundaries (user input, external APIs)

## Output

Create `docs/audit/` if it doesn't exist. Write one file per section:

| File | Contents |
|---|---|
| `architecture-report.md` | Folder map, responsibility analysis, coupling issues, naming inconsistencies |
| `dead-code.md` | Unreferenced exports, commented-out blocks, orphan files |
| `dependency-report.md` | Unused packages, undeclared imports, version notes |
| `technical-debt.md` | TODO/FIXME list, oversized files/functions, hardcoded values |
| `improvement-plan.md` | Prioritized action list: quick wins first, then structural changes |

Each file starts with a summary paragraph, followed by one section per finding.
Each finding includes: file path, line number (if applicable), and one sentence describing the problem.

A well-written finding says exactly where the problem is and why it matters:

> ✅ `parsers/dhl_tarifa.py:142` — Function `parse_row` is duplicated in `parsers/dhl_parcel.py:89` with identical logic.
>
> ❌ "There is duplicated code in the parsers."

## What makes a good audit

**Read the actual files.** A folder name is not evidence. If you haven't read it, don't report it.

**No file path = not a finding.** Any observation without a concrete location is an opinion, not a data point. The team needs to know exactly where to go.

**The improvement plan must be actionable.** Each item is a concrete task that someone can assign and complete. "Improve the architecture" is not a task. "Move the tariff calculation logic from `views/tarifas.py` to `services/tarifa_calculator.py`" is.

**This skill is read-only.** Analyze, report, suggest — but do not modify any source file.
