
# Agoré Database and Migration Guide

**Status:** Migration workflow defined; historical reconciliation outstanding.

## 1. Purpose

This document defines how Agoré database changes must be created, reviewed, tracked, and applied.

A migration file in Git does not prove that its SQL has been applied to a Supabase database. Likewise, a schema change made in the Supabase dashboard is not automatically recorded in the repository.

The repository and each database's migration history must be reconciled before automated migrations can be treated as reliable.

## 2. Canonical migration directory

The authoritative location for new Agoré database migrations is:

`supabase/migrations/`

All new migration files must be stored there.

The directory `app/supabase/migrations/` is not a supported location for new migrations. Its existing migration must be reconciled before that directory is retired.

The repository currently has no `supabase/config.toml`. Consequently, do not assume that a complete Supabase CLI project configuration or linked migration workflow is already established.

## 3. Existing reconciliation requirement

The repository contains this migration outside the canonical directory:

`app/supabase/migrations/20261010150000_agore_support_staff_workflow_v0.sql`

It defines database functions for updating support cases, adding staff replies or internal notes, and listing support assignees. It also restricts function execution to `service_role`.

Before moving, copying, applying, or deleting this file:

1. Identify the exact Supabase project being examined.
2. Inspect that project's migration history and actual database schema.
3. Determine whether the migration's SQL has already been applied.
4. Compare the database state with the migration files that precede and depend on it.
5. Record and resolve any difference between the repository and the database.

Do not apply this SQL a second time merely because the file is in the wrong directory. Do not mark it as applied merely to hide a pending migration.

Once the database state is understood, move the historical migration into the canonical directory if appropriate, preserving its version and contents. Remove the duplicate location only after the reconciliation has been verified.

## 4. Required project setup

Before relying on the Supabase CLI for database changes:

1. Establish the project's Supabase CLI configuration.
2. Confirm the intended development project and its project reference.
3. Use a development environment separate from production.
4. Inspect the repository's migration files and the selected database's migration history.
5. Reconcile the existing migration discrepancy before applying additional SQL.

Never assume a project is correctly linked because the Supabase CLI is installed or a command succeeds.

Do not link to, reset, or modify a remote database until the target project has been positively identified.

## 5. Creating new migrations

Use timestamped, descriptive filenames in the canonical directory.

Naming format:

`YYYYMMDDHHMMSS_descriptive_name.sql`

Examples:

- `20261015100000_add_profile_preference.sql`
- `20261015103000_secure_profile_preference.sql`

Choose a unique timestamp and a name that describes the schema or policy change.

Each migration should be a small, reviewable unit that explains its purpose and any security implications.

Where appropriate:

- Include the necessary constraints and indexes.
- Apply least-privilege permissions.
- Consider Row Level Security (RLS) and grants explicitly.
- Make assumptions about existing data visible.
- Preserve existing data unless data modification is part of the reviewed change.
- Provide appropriate comments for security-sensitive database functions.
- Consider transactional behavior and failure handling.

A successful SQL execution is not, by itself, proof that the migration is safe or correct.

## 6. Applied migrations are historical records

Once a migration has been applied to a shared or production database, treat its SQL file as immutable.

Do not edit the historical file to change the intended result. Create a new migration to correct or extend the schema.

If a historical file contains an error, inspect the actual database state first. Then create an explicit corrective migration or reconcile the migration history using a verified recovery procedure.

Never delete a migration simply because it appears to be redundant.

## 7. Required workflow for database changes

### Step 1 — Inspect

Identify the affected tables, functions, policies, indexes, triggers, storage permissions, and application code.

Determine whether the change depends on earlier migrations or existing production data.

### Step 2 — Write

Create the migration under `supabase/migrations/`.

Review the entire SQL file before considering application. Check permissions, RLS behavior, dependencies, and whether the operation can safely run more than once where required.

### Step 3 — Review migration history

Once CLI configuration and the database target are confirmed, use:

```bash
supabase migration list
```

Compare local migration versions with the remote database's migration history.

The CLI tracks remote versions in `supabase_migrations.schema_migrations`. It compares migration timestamps, so matching filenames and actual schema state both matter.

### Step 4 — Validate in development

Apply the migration to the intended development environment first.

Verify the resulting schema, constraints, indexes, functions, policies, grants, and affected application behavior. Do not rely solely on a successful command exit.

### Step 5 — Review the production plan

Before a production change, inspect which migrations are pending. Where supported, use a dry run:

```bash
supabase db push --dry-run
```

Review the output and ensure that no unexpected migration, destructive operation, or unrelated schema change is included.

A dry run does not prove that the database change is safe. It only helps identify what the CLI intends to apply.

### Step 6 — Apply deliberately

Apply only after the target project, pending migration list, backup or recovery requirements, and development verification have been reviewed.

Do not reset a remote production database as a migration-recovery shortcut.

### Step 7 — Verify and record

Verify the resulting database state and affected application behavior. Confirm that migration tracking agrees with the actual schema.

Commit the migration and any associated application changes and documentation to Git.

Record any production change that was made outside the migration workflow and reconcile it afterwards.

## 8. Resolving migration-history differences

Use `supabase migration repair` only after the actual database state and history have been investigated.

Mark a migration as applied only when its intended changes are already present and have been verified. This adjusts migration history; it does not execute the SQL.

Mark a migration as reverted only when the tracking correction is justified by the actual database state. This does not undo schema changes.

Do not use migration-history repair to make an unexplained discrepancy disappear.

Official references:

- [Supabase CLI migration list](https://supabase.com/docs/reference/cli/supabase-migration-list)
- [Supabase CLI migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair)

## 9. Production safeguards

Before applying a production migration:

- Confirm the exact target project.
- Review the complete SQL and its dependencies.
- Confirm that the development verification passed.
- Check whether the change locks or rewrites large tables.
- Consider existing data, concurrent application traffic, and rollback limitations.
- Ensure that a suitable backup or recovery path exists for the affected data.
- Review the expected migration plan.
- Verify the final schema and application behavior afterwards.

Do not put secrets or connection strings in migration files, commits, or public documentation.

Database migrations must not weaken authentication, account-status enforcement, staff authorization, conversation privacy, storage access controls, or other security boundaries without an explicit and reviewed design decision.

## 10. Current status

The migration workflow is documented, but historical reconciliation is not yet complete.

Outstanding items:

- [ ] Establish and verify the Supabase CLI configuration.
- [ ] Confirm the intended development project.
- [ ] Compare repository migrations with the actual database migration history.
- [ ] Reconcile `20261010150000_agore_support_staff_workflow_v0.sql`.
- [ ] Verify that the canonical directory and database history agree.
- [ ] Test the resulting migration workflow in development before relying on it for production.

Until these items are resolved, do not treat the repository migration history as proof that the live database matches the repository.
