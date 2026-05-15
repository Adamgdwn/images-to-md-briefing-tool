create extension if not exists "pgcrypto";

create type public.app_role as enum ('owner', 'reviewer', 'developer');
create type public.project_status as enum ('active', 'archived');
create type public.document_file_type as enum ('docx', 'odt', 'odp', 'ods', 'odg', 'pdf', 'png', 'jpg', 'jpeg', 'webp');
create type public.artifact_type as enum (
  'ui_form_screen',
  'ui_dashboard_screen',
  'workflow_diagram',
  'slide_layout',
  'table_heavy',
  'mixed_visual',
  'unknown_manual_review'
);
create type public.artifact_category as enum (
  'ui_screen',
  'ui_dialog',
  'workflow_visual',
  'presentation_visual',
  'document_visual',
  'unknown_manual_review'
);
create type public.artifact_subtype as enum (
  'dashboard_screen',
  'settings_screen',
  'data_entry_form',
  'table_list_view',
  'detail_view',
  'auth_screen',
  'editor_screen',
  'navigation_home',
  'confirmation_dialog',
  'settings_dialog',
  'auth_dialog',
  'file_picker_dialog',
  'export_dialog',
  'warning_dialog',
  'specialized_task_dialog',
  'process_map',
  'flowchart',
  'decision_tree',
  'swimlane_diagram',
  'journey_map',
  'relationship_map',
  'slide_layout',
  'executive_summary_slide',
  'comparison_slide',
  'annotated_mockup',
  'concept_board',
  'scanned_page',
  'table_capture',
  'form_snapshot',
  'contract_section',
  'report_page',
  'annotated_document',
  'signature_or_stamp_region',
  'unknown_manual_review'
);
create type public.processing_status as enum ('queued', 'processing', 'completed', 'failed');
create type public.review_status as enum ('draft', 'approved', 'rejected');
create type public.package_type as enum (
  'functional_additions',
  'developer_stories',
  'implementation_brief',
  'codex_ready_package'
);
create type public.audit_event_type as enum (
  'project_created',
  'source_uploaded',
  'artifact_extracted',
  'artifact_reviewed',
  'artifact_approved',
  'artifact_rejected',
  'output_generated'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.app_role not null default 'owner',
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_context text,
  status public.project_status not null default 'active',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  filename text not null,
  file_type public.document_file_type not null,
  storage_path text not null,
  page_count integer,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete cascade,
  stage text not null default 'uploaded',
  status public.processing_status not null default 'queued',
  error_log text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete cascade,
  page_number integer,
  image_path text not null,
  artifact_type public.artifact_type not null default 'unknown_manual_review',
  confidence numeric(4, 3) not null default 0.5,
  category public.artifact_category not null default 'unknown_manual_review',
  subtype public.artifact_subtype not null default 'unknown_manual_review',
  classification_confidence numeric(4, 3) not null default 0,
  classification_reasons jsonb not null default '[]'::jsonb,
  ocr_backend text not null default 'unrecorded',
  ocr_confidence numeric(4, 3) not null default 0,
  interpretation_backend text not null default 'local_template',
  interpretation_confidence numeric(4, 3) not null default 0,
  processing_status public.processing_status not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artifact_extractions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  raw_ocr_text text,
  layout_data jsonb not null default '[]'::jsonb,
  layout_summary text,
  ui_elements_json jsonb not null default '[]'::jsonb,
  markdown_output text not null default '',
  json_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.artifact_reviews (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_status public.review_status not null default 'draft',
  edited_markdown text not null default '',
  edited_json jsonb not null default '{}'::jsonb,
  notes text,
  approved_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.output_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  package_type public.package_type not null,
  source_selection jsonb not null default '[]'::jsonb,
  output_markdown text not null,
  output_json jsonb not null default '{}'::jsonb,
  storage_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type public.audit_event_type not null,
  subject_type text not null,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.source_documents enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.artifacts enable row level security;
alter table public.artifact_extractions enable row level security;
alter table public.artifact_reviews enable row level security;
alter table public.output_packages enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles are self readable" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles are self writable" on public.profiles
  for update using (auth.uid() = id);

create policy "users manage own projects" on public.projects
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "users read own source documents" on public.source_documents
  for select using (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  ));

create policy "users manage own source documents" on public.source_documents
  for all using (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  )) with check (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  ));

create policy "users manage own jobs" on public.processing_jobs
  for all using (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  )) with check (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  ));

create policy "users manage own artifacts" on public.artifacts
  for all using (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  )) with check (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  ));

create policy "users manage own artifact extractions" on public.artifact_extractions
  for all using (exists (
    select 1
    from public.artifacts a
    join public.projects p on p.id = a.project_id
    where a.id = artifact_id and p.created_by = auth.uid()
  )) with check (exists (
    select 1
    from public.artifacts a
    join public.projects p on p.id = a.project_id
    where a.id = artifact_id and p.created_by = auth.uid()
  ));

create policy "users manage own artifact reviews" on public.artifact_reviews
  for all using (exists (
    select 1
    from public.artifacts a
    join public.projects p on p.id = a.project_id
    where a.id = artifact_id and p.created_by = auth.uid()
  )) with check (exists (
    select 1
    from public.artifacts a
    join public.projects p on p.id = a.project_id
    where a.id = artifact_id and p.created_by = auth.uid()
  ));

create policy "users manage own output packages" on public.output_packages
  for all using (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  )) with check (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  ));

create policy "users read own audit events" on public.audit_events
  for select using (exists (
    select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()
  ));

insert into storage.buckets (id, name, public)
values ('source-documents', 'source-documents', false),
       ('artifact-images', 'artifact-images', false),
       ('output-packages', 'output-packages', false)
on conflict (id) do nothing;

create policy "authenticated upload source documents" on storage.objects
  for insert with check (bucket_id = 'source-documents' and auth.role() = 'authenticated');

create policy "authenticated upload artifact images" on storage.objects
  for insert with check (bucket_id = 'artifact-images' and auth.role() = 'authenticated');

create policy "authenticated upload output packages" on storage.objects
  for insert with check (bucket_id = 'output-packages' and auth.role() = 'authenticated');

create policy "authenticated read controlled storage" on storage.objects
  for select using (bucket_id in ('source-documents', 'artifact-images', 'output-packages') and auth.role() = 'authenticated');
