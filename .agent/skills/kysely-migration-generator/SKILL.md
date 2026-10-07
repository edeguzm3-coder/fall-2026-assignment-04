---
name: kysely-migration-generator
description: Reads a compiled Mermaid ERD (docs/architecture/schema.mmd, or the erd.svg rendered from it) and translates it into a type-safe Kysely PostgreSQL migration in src/db/migrations/ with up and down functions. Use when the user asks to generate, write, or create a database migration, Kysely migration, DDL, or tables from an ERD, Mermaid diagram, data model, or schema.mmd.
---

# Kysely Migration Generator

Translate a Mermaid `erDiagram` into a Kysely migration that compiles (`npm run build`) and
runs (`npm run migrate:up`) cleanly.

## Inputs & Outputs

| Purpose            | Path                                                |
| ------------------ | --------------------------------------------------- |
| ERD source         | `docs/architecture/schema.mmd` (preferred)          |
| ERD fallback       | `docs/architecture/erd.svg` (read entity/attribute text from the SVG only if no `.mmd` exists) |
| Reference baseline | `src/db/migrations/001_initial_schema.ts`           |
| Output             | `src/db/migrations/<timestamp>_<migration_name>.ts` |

## Workflow

1. **Read the ERD** and list every entity, attribute (type, name, keys, comment), and
   relationship with its cardinality.
2. **Read every existing file in `src/db/migrations/`.** Any table already created there must
   **not** be created again — it may only be referenced by foreign keys. Match FK column types to
   the existing PK type (e.g. `serial` PK → `integer` FK).
3. **Order tables by dependency** (topological sort): a table is created only after every table
   it references. Junction tables come last.
4. **Write the migration file** using the rules below.
5. **Verify**: run `npm run build`, then `npm run migrate:up`. If either fails, read the error,
   fix the migration, and re-run (up to 3 retries). Report the final command output.

## Translation Rules

### Entities → Tables

- Table name = entity name converted to `snake_case` lowercase: `USERS` → `users`,
  `BookAuthors` / `BOOK_AUTHORS` → `book_authors`.
- Column names = attribute names converted to `snake_case`.

### Data types (Mermaid → Kysely)

| Mermaid type                 | Kysely column type      |
| ---------------------------- | ----------------------- |
| `serial`, `int` + `PK`       | `'serial'`              |
| `int`, `integer`             | `'integer'`             |
| `bigint`                     | `'bigint'`              |
| `varchar`, `string`          | `'varchar(255)'`        |
| `varchar(n)`                 | `'varchar(n)'`          |
| `text`                       | `'text'`                |
| `boolean`, `bool`            | `'boolean'`             |
| `date`                       | `'date'`                |
| `timestamp`, `datetime`      | `'timestamp'`           |
| `decimal`, `numeric`, `float`| `'numeric(10, 2)'` unless precision is given |
| `uuid`                       | `'uuid'`                |

### Keys & Columns

- **`PK`** → auto-generating ID:
  - integer/serial: `.addColumn('id', 'serial', (col) => col.primaryKey())`
  - uuid: `.addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql\`gen_random_uuid()\`))`
- **`FK`** → typed like the referenced PK (`serial` → `'integer'`), not null, with cascade:
  `.addColumn('book_id', 'integer', (col) => col.notNull().references('books.id').onDelete('cascade'))`
  The referenced table is the entity on the `||` side of the relationship that involves this FK.
- **`UK`** → `.unique()`.
- A comment containing `not null` / `required` → `.notNull()`. Columns are nullable otherwise
  (FKs are always `notNull()`).
- A comment containing `default <value>` → `.defaultTo(<value>)`; `created_at` / timestamp
  defaults of `now` → `.defaultTo(sql\`NOW()\`).notNull()`.
- Junction tables with two FKs and no surrogate `PK` → add a composite primary key:
  `.addPrimaryKeyConstraint('<table>_pkey', ['a_id', 'b_id'])`.

### Cardinalities

| Mermaid      | Meaning                     | Kysely implementation                                         |
| ------------ | --------------------------- | ------------------------------------------------------------- |
| `A \|\|--o{ B` | one-to-many (zero or more) | FK column on `B` → `A.id`, `.onDelete('cascade')`               |
| `A \|\|--\|{ B` | one-to-many (one or more)  | same as above                                                  |
| `A \|\|--o\| B` | one-to-one (zero or one)   | FK column on `B` → `A.id`, `.onDelete('cascade')` **and `.unique()`** |
| `A \|\|--\|\| B` | one-to-one (exactly one)   | same as one-to-one, `.notNull().unique()`                      |
| `A }o--o{ B` | many-to-many                | create junction table `a_b` with FKs to both + composite PK     |

The FK always lives on the "many" (or dependent) side.

### File Output

- Path: `src/db/migrations/<timestamp>_<migration_name>.ts`
  - `<timestamp>` = current UTC time as `YYYYMMDDHHMMSS` (e.g. `20261007153000`), so it sorts
    after `001_initial_schema.ts` and any earlier migration.
  - `<migration_name>` = short `snake_case` description (e.g. `library_management`).
- Never modify existing migration files.

### Structure

The file must look like this and must export **both** functions:

```ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // parents first
  await db.schema
    .createTable('genres')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'varchar(100)', (col) => col.notNull().unique())
    .execute();

  // then children
  await db.schema
    .createTable('books')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('genre_id', 'integer', (col) =>
      col.notNull().references('genres.id').onDelete('cascade')
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // exact reverse of creation order: children first
  await db.schema.dropTable('books').execute();
  await db.schema.dropTable('genres').execute();
}
```

- `up` creates tables in dependency order; each `createTable` chain ends with `.execute()` and
  is `await`ed.
- `down` drops **only the tables this migration created**, in **reverse dependency order**
  (exact reverse of `up`). Never drop tables owned by earlier migrations (e.g. `users`).
- Only import `sql` if it is used, otherwise import just `Kysely`.
- Use single quotes and 2-space indentation, matching `001_initial_schema.ts`.

## Final Output

Tell the user the new file path, the table creation order, the drop order, any ERD entities
that were skipped because they already exist, and the results of `npm run build` and
`npm run migrate:up`.
