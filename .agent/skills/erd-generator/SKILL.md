---
name: erd-generator
description: Designs a database Entity-Relationship Diagram (ERD) from an unstructured domain or business description, writes it as Mermaid erDiagram syntax to docs/architecture/schema.mmd, validates it and renders docs/architecture/erd.svg with a local script, and self-corrects syntax errors. Use when the user asks to design, draft, model, or visualize an ERD, a data model, a database schema, entities and relationships, or an architecture/database diagram.
---

# ERD Generator

Turn domain requirements into a **validated** Mermaid ERD and a rendered SVG. Never hand the
user a diagram that has not passed the render script.

## Files

| Purpose          | Path                                               |
| ---------------- | -------------------------------------------------- |
| Mermaid source   | `docs/architecture/schema.mmd`                     |
| Rendered diagram | `docs/architecture/erd.svg`                        |
| Validator        | `.agent/skills/erd-generator/scripts/render_erd.js` |

All commands are run from the repository root.

## Execution Workflow

### 1. Parse the domain requirements

Before writing any syntax, extract and list:

- **Entities** – one per real-world noun the system stores. Name them in `UPPER_SNAKE_CASE`
  plural (e.g. `USERS`, `BOOK_AUTHORS`).
- **Attributes** – every column with a type. Use Postgres-friendly types:
  `int`, `serial`, `varchar`, `text`, `boolean`, `date`, `timestamp`, `decimal`, `uuid`.
- **Primary keys** – every entity has exactly one `id` attribute marked `PK`.
- **Foreign keys** – named `<referenced_singular>_id` (e.g. `book_id`), typed the same as the
  referenced PK, and marked `FK`. Mark FKs that must be unique (one-to-one) as `FK, UK`.
- **Cardinalities** – decide each relationship explicitly:
  - `||--o{` one-to-many (parent may have zero or many children)
  - `||--|{` one-to-many (parent must have at least one child)
  - `||--o|` one-to-one (child FK is unique)
  - Many-to-many → introduce a junction entity with two `||--o{` relationships.
- **Existing tables** – if the user says a table already exists (e.g. `USERS`), still include it
  in the diagram so relationships are visible, but keep its columns consistent with the existing
  migration in `src/db/migrations/`.

If a requirement is ambiguous, pick the most conventional option and state the assumption in
your final answer.

### 2. Write the Mermaid file

Write the diagram directly to `docs/architecture/schema.mmd`. The file must contain **only**
Mermaid syntax (no Markdown fences). Follow this shape:

```
erDiagram
    USERS ||--o{ LOANS : "places"

    USERS {
        serial id PK
        varchar email UK "not null"
    }
    LOANS {
        serial id PK
        int user_id FK
    }
```

Syntax rules that avoid the most common render failures:

- First line is exactly `erDiagram`.
- Attribute lines are `type name [PK|FK|UK[, ...]] ["comment"]` — type first, then name.
- Types and names contain only letters, digits, `_`, `-`, and parentheses (e.g. `varchar(255)`);
  no spaces.
- Relationship labels are quoted: `A ||--o{ B : "has"`.
- Every entity used in a relationship must be spelled identically to its block.
- Comments go in double quotes after the keys; never use `--` or `#` comments inside blocks.

### 3. Validate and render

Run:

```bash
node .agent/skills/erd-generator/scripts/render_erd.js docs/architecture/schema.mmd
```

- Output `SUCCESS` (exit code 0) → `docs/architecture/erd.svg` was generated. Go to step 5.
- Output beginning with `SYNTAX_ERROR:` (exit code 1) → go to step 4.

### 4. Self-correction loop (max 3 retries)

1. Read the full `SYNTAX_ERROR:` trace. Locate the reported line/token (Mermaid parse errors
   show the offending line and an `Expecting ... got ...` message).
2. Fix **only** the offending syntax in `docs/architecture/schema.mmd` — do not drop entities,
   attributes, or relationships to make the error go away.
3. Re-run the command from step 3.
4. Repeat up to **3 retries**. If it still fails after the third retry, stop, show the user the
   last error trace and the current Mermaid source, and explain what you tried.

### 5. Final output

Reply to the user with:

1. A short summary of entities, relationships, and any assumptions/business decisions.
2. The raw Mermaid source in a fenced `mermaid` code block (exactly the contents of
   `docs/architecture/schema.mmd`).
3. The rendered asset path: `docs/architecture/erd.svg`.
4. How many self-correction retries were needed (0 if it passed first time).

## Guardrails

- Never report success unless the script printed `SUCCESS` on the latest run.
- Never edit `erd.svg` by hand; it is only produced by the render script.
- Do not install packages; `@mermaid-js/mermaid-cli` is already a dev dependency.
- If the user later asks for a database migration, hand off to the
  `kysely-migration-generator` skill using `docs/architecture/schema.mmd`.
