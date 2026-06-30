---
name: project-organizer
description: >
  Restructure and clean up the project layout. Use whenever the user says "move
  this file", "rename this folder", "the structure is messy", "reorganize the project",
  "unify the naming", "there are duplicate functions", "the imports are broken",
  "create a standard structure", "clean up the folders", "split this file", or
  asks to restructure any part of the codebase — even if they don't use the word
  "organize". Also use when the user asks to fix a naming inconsistency or consolidate
  code that exists in more than one place.
---

# Project Organizer

Restructures the codebase: moves files, renames folders, unifies naming conventions,
eliminates duplicate code, reorganizes imports, and creates standard directory layouts.

This skill modifies the project. It produces a Change Plan and waits for explicit
approval before touching anything. The plan is the deliverable of the first half;
execution is the second half.

---

## Phase 0 — Clarify scope first

Before reading a single file, make sure the request is specific enough to plan.
"Reorganize the parsers" could mean a dozen different things. A 30-second question
saves a plan nobody wanted.

Ask only what you need. If the user's intent is clear, skip this and go to Phase 1.
If it's ambiguous, one focused question: "Do you want to move files between folders,
rename things, consolidate duplicates, or all of the above?"

---

## Phase 1 — Analysis

Read the parts of the codebase relevant to the requested change. The goal is to know
the full blast radius before writing a single line of the plan.

At minimum, read:
- `docs/context/FOLDER_STRUCTURE.md` if it exists — saves re-deriving the structure
- All files that would be moved or renamed
- All files that import from those files (every broken import is a bug introduced)
- Config files that reference paths by name: `ecosystem.config.cjs`, `pyproject.toml`,
  `tsconfig.json`, `package.json` scripts, etc.

---

## Phase 2 — Change Plan

Present the Change Plan before doing anything. Use this structure:

```
## Change Plan — [date]

### Summary
One paragraph: what problem this solves and what the result will look like.

### Operations

| # | Operation | From | To | Rationale | Depends on |
|---|---|---|---|---|---|
| 1 | MOVE   | parsers/dhl_tarifa.py | parsers/tariffs/dhl.py | Separate invoice parsers from tariff parsers | — |
| 2 | RENAME | services/geo_es.py | services/geo.py | Remove _es suffix — all geo data is Spain | — |
| 3 | DELETE | ecosystem.config.cjs | — | Hardcodes path from another machine, never used | — |
| 4 | EXTRACT | views/carga.py:181–336 | exports/report_excel.py | _build_report_excel() belongs in exports layer | — |
| 5 | UNIFY  | geo_es.py:13, dhl_tarifa.py:103, molartrans_tarifa.py:52 | normalizer.normalize_text() | Three copies of _norm() — one is enough | — |

### Import changes required
- `views/carga.py` — `from parsers.dhl_tarifa import ...` → `from parsers.tariffs.dhl import ...`
- `services/tariff_engine.py` — `from services.geo_es import ...` → `from services.geo import ...`

### What will NOT change
- All public function names stay the same
- Database schema unchanged
- No behaviour changes — this is structure only

### Risks
[Anything worth flagging: circular import risk, config files that need updating,
operations that can't be independently rolled back, etc.]
```

**Fill in the "Depends on" column** whenever an operation requires a previous one to
complete first (e.g., a new directory must exist before files can move into it).
This column makes partial approvals safe — the user can see what they're blocking
if they skip an operation.

After presenting the plan, **stop and wait**. Do not begin executing until the user
explicitly confirms — either the full plan or specific operations by number.

If the user approves only a subset, check the Depends on column for each approved
operation before starting. Warn if a dependency was not approved.

---

## Phase 3 — Pre-execution checkpoint

Before the first file move, two quick checks:

**1. Suggest a commit if the user hasn't made one recently.** Structural changes
are reversible with git, but only if there's a clean rollback point. One sentence:
"Want to commit current state before we start so you have a clean checkpoint?"

**2. Verify the full import blast radius one more time** — grep for the exact module
paths that will change and confirm the list matches what's in the plan. Any surprise
here is better found now than mid-execution.

---

## Phase 4 — Execution

Execute approved operations in dependency order (check the Depends on column):

1. **Create new directories** before moving files into them
2. **Move or copy files** to their new locations
3. **Update all imports** in every file that references the moved path
4. **Delete originals** only after confirming the new location works and imports are clean
5. **Smoke check** — run the project's start command to confirm nothing broke

After each operation, verify it completed correctly before moving to the next. If
something breaks, stop and report the current state rather than continuing into a
half-done reorganization.

### Finding and updating imports (Python)

```bash
# Find every file that imports from the path being moved
grep -rn "from parsers.dhl_tarifa" . --include="*.py"
grep -rn "import parsers.dhl_tarifa" . --include="*.py"
```

Edit each file found. After editing, grep once more to confirm no old references remain.

### Smoke check

For a Streamlit app: `py -3.14 -m streamlit run app.py --server.headless true`
and watch for import errors in the first few seconds. Exit with Ctrl-C once it
starts without errors.

For a Node/TypeScript app: `npm run build` or `tsc --noEmit` — compilation errors
surface broken imports immediately without starting a server.

### Consolidating duplicate functions

When merging multiple copies of the same utility (e.g., three `_norm()` functions):

1. Pick the best implementation — usually the most complete or the one with the
   fewest assumptions baked in
2. Add it to the canonical location (e.g., `normalizer.py`) under a clear name
3. In each file that had a duplicate: replace the local definition with an import
   from the canonical location
4. Remove the local definition
5. Run the smoke check — if function signatures matched, callers need no changes

---

## Phase 5 — After execution

1. **Report what was done** — list each operation, note anything skipped or adjusted.
2. **Run `/knowledge-sync`** — the structure changed, so `docs/context/` needs
   updating. At minimum `FOLDER_STRUCTURE.md`; possibly `ARCHITECTURE.md` and
   `API_REFERENCE.md` depending on what moved.

---

## Core principle

Structure changes should be invisible to behaviour. If you need to change logic to
make the new structure work, that is a refactor — a different task. Note it, skip it,
finish the structural move cleanly.

Imports are part of the move. A file that moved but left broken imports is not done.
