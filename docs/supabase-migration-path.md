# Supabase Migration Path

## Apply Order

Apply migrations in filename order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_schema_parity_exports_lifecycle.sql`

`002_schema_parity_exports_lifecycle.sql` brings the hosted schema up to the current local workflow.

## What Chunk 4 Adds

- Adds `bulk_llm_export` to `public.package_type`.
- Adds lifecycle and deletion audit events:
  - `project_updated`
  - `project_archived`
  - `project_restored`
  - `project_deleted`
  - `project_imported`
  - `output_deleted`
- Adds export option columns to `public.output_packages`:
  - `export_content`
  - `export_format`
  - `export_generated_at`
  - `export_generated_at_display`
- Backfills export options and timestamps from existing `output_json` where possible.
- Changes `audit_events.project_id` to `on delete set null` so delete/import audit records can survive project removal.
- Replaces broad authenticated storage policies with user-folder ownership policies.

## Storage Path Convention

Hosted storage objects must use the authenticated user ID as the first path segment:

```text
<auth.uid()>/<project-id>/<object-id-or-filename>
```

Examples:

```text
source-documents/00000000-0000-0000-0000-000000000000/project-a/source.docx
artifact-images/00000000-0000-0000-0000-000000000000/project-a/artifact-1.png
output-packages/00000000-0000-0000-0000-000000000000/project-a/export.md
```

The bucket name is not part of the object name stored in `storage.objects.name`; it is shown above for clarity.

## Existing Hosted Data

Before applying the storage policy tightening to a project with existing files, move any existing storage objects so their first folder segment is the owning user's auth UUID. Objects outside that convention will become inaccessible to normal authenticated clients after the migration.

The service-role client can still perform administrative migrations and cleanup.

## Cascade Behavior

Deleting a project cascades these project-owned records:

- source documents
- processing jobs
- artifacts
- artifact extractions
- artifact reviews
- output packages

Audit events are retained with `project_id = null` after project deletion. Include project name and original project ID in audit metadata when writing delete/import events so retained audit rows remain useful.

Storage objects are not automatically deleted by database cascades. The application must delete source documents, artifact images, and output package files from storage before or after deleting the project record.

## Validation

For a test Supabase project:

1. Apply both migrations in order.
2. Confirm the `bulk_llm_export` package type is accepted.
3. Confirm `output_deleted` and project lifecycle event values are accepted.
4. Upload one file under `<auth.uid()>/...` and confirm the owning user can read it.
5. Upload or read a file outside `<auth.uid()>/...` as a normal authenticated user and confirm it is blocked.
6. Delete a project and confirm owned records cascade while audit rows survive with `project_id = null`.
