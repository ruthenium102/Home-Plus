# Supabase SQL — layout

This directory holds the historical incremental migrations that have been
applied to existing Home Plus databases.

## How to read this layout

- **`../schema.sql`** is the **source of truth** for a fresh database. Run
  it once to get the full current schema. Do not chain migrations on top of
  a fresh DB — `schema.sql` already represents the end state.

- **`migrate_v1.sql` … `migrate_v5.sql`** are the historical migrations that
  were applied in order to bring an _existing_ pre-v1 deployment up to the
  current schema. They are kept for reference and for any DBs that need to
  be upgraded one step at a time. **Do not run them on a fresh DB.**

- **`../drop.sql`** drops the schema. Destructive — see file for details.

- **`../reset.sql`** drops and re-creates from `schema.sql`. Destructive.

## Adding a new migration

When the schema changes:

1. Add the change to `../schema.sql` so a fresh setup gets the new shape.
2. Add a new `migrate_vN.sql` here so existing deployments can upgrade.
3. Document in the migration file what it does and which version it
   targets.
