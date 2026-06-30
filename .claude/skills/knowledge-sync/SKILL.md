---
name: knowledge-sync
description: >
  Keep docs/context/ in sync with the current state of the codebase. Use whenever
  the user says "update the docs", "sync the context", "the docs are out of date",
  "update the architecture doc", "add this decision to the docs", or after completing
  any task that changed how the project works — new feature, refactor, dependency
  change, new agency parser, architectural decision, or anything that would make
  docs/context/ misleading if left unchanged. Also use proactively at the end of
  a work session when significant code was written or modified.
---

# Knowledge Sync

Keeps `docs/context/` accurate as the project evolves. The goal is surgical — read
what changed, update only the files and sections that are affected, and leave
everything else untouched. A document that is partially wrong is worse than no
document at all, so outdated content must be removed, not just appended to.

## Step 1 — Understand what changed

Before touching any doc, figure out what actually changed. Use git to get the picture:

```bash
git diff HEAD~1 --name-only          # files changed in the last commit
git log --oneline -10                # recent commit messages for context
git diff HEAD~1 -- <specific-file>   # details for a file of interest
```

If the user described the change in conversation, use that description alongside the
diff — the user's words often capture the *why* that the diff cannot.

If `docs/context/` files have `> Last updated:` dates, compare them against
`git log --after="<date>"` to find everything that changed since each doc was last written.

## Step 2 — Map changes to context files

Not every change affects every document. Match what changed to which docs care:

| What changed | Likely affected docs |
|---|---|
| New file or folder added | `FOLDER_STRUCTURE.md` |
| New service, parser, or view | `ARCHITECTURE.md`, `FOLDER_STRUCTURE.md`, `API_REFERENCE.md` |
| New agency or agency status change | `PROJECT_OVERVIEW.md`, `BUSINESS_RULES.md` |
| New `requirements.txt` dependency | `TECH_STACK.md` |
| New ORM model or field | `DOMAIN_MODEL.md`, `API_REFERENCE.md` |
| New business rule or tariff logic | `BUSINESS_RULES.md` |
| New coding pattern or convention | `CODING_STANDARDS.md` |
| Architectural decision | `ARCHITECTURE.md`, `PROJECT_OVERVIEW.md` |
| File or function deleted | Any doc that mentions it — remove those references |
| Function renamed or moved | `API_REFERENCE.md`, `CODING_STANDARDS.md` |

## Step 3 — Read the current doc, then update

For each affected doc:
1. Read it fully to understand what is already there
2. Identify what is now wrong, missing, or obsolete
3. Edit surgically — change the section, not the whole file
4. Update the `> Last updated: YYYY-MM-DD` line at the top

Precision matters here. Replacing an entire document to add one new service is wasteful
and risks losing correct content. Patch the relevant section.

**Remove obsolete content actively.** If a function was deleted, remove its entry from
`API_REFERENCE.md`. If an agency moved from "in development" to "validated", update the
status table in `PROJECT_OVERVIEW.md`. Stale content left in place misleads the next
reader as much as missing content does.

## Step 4 — Capture decisions explicitly

Architecture decisions are the hardest thing to reconstruct later from code alone.
If the change involved a deliberate choice — why one approach over another, a constraint
discovered, a workaround for a known limitation — add it to the relevant doc.

Good decision notes are concrete:

> **Why `reglas_json` instead of a separate `TarifaRegla` table:** The tariff structure
> varies significantly between agencies. A fixed schema would require nullable columns
> for every agency variant. JSON lets each agency store exactly its own structure without
> schema migrations every time a new agency is added.

Poor decision notes are vague: "Chose JSON for flexibility." A future reader cannot
evaluate whether that reasoning still applies without the context.

## Step 5 — Report what you updated

After making changes, summarise for the user:

- Which docs were updated and why
- What was added
- What was removed as obsolete
- Any doc that was *not* updated because the change didn't affect it (optional, but
  helps confirm the sync was thorough)

This makes it easy to spot anything missed and gives confidence that the docs are current.

---

## When docs/context/ does not exist yet

If the directory is missing or nearly empty, this is a bigger job than a sync — it
needs a full generation pass. Use `/project-context` instead, which does a complete
read of the codebase and writes all eight documents from scratch.

`knowledge-sync` assumes `docs/context/` already exists and is roughly accurate.
Its job is keeping existing docs current, not creating them.
