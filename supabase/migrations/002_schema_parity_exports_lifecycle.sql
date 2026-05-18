alter type public.package_type add value if not exists 'bulk_llm_export';

alter type public.audit_event_type add value if not exists 'project_updated';
alter type public.audit_event_type add value if not exists 'project_archived';
alter type public.audit_event_type add value if not exists 'project_restored';
alter type public.audit_event_type add value if not exists 'project_deleted';
alter type public.audit_event_type add value if not exists 'project_imported';
alter type public.audit_event_type add value if not exists 'output_deleted';

alter table public.output_packages
  add column if not exists export_content text not null default 'markdown',
  add column if not exists export_format text not null default 'md',
  add column if not exists export_generated_at timestamptz not null default now(),
  add column if not exists export_generated_at_display text;

alter table public.output_packages
  drop constraint if exists output_packages_export_content_check,
  add constraint output_packages_export_content_check
    check (export_content in ('markdown', 'json', 'both'));

alter table public.output_packages
  drop constraint if exists output_packages_export_format_check,
  add constraint output_packages_export_format_check
    check (export_format in ('md', 'txt', 'json'));

update public.output_packages
set
  export_content = case
    when output_json #>> '{export_options,content}' in ('markdown', 'json', 'both') then output_json #>> '{export_options,content}'
    when output_json ->> 'export_content' in ('markdown', 'json', 'both') then output_json ->> 'export_content'
    else export_content
  end,
  export_format = case
    when output_json #>> '{export_options,format}' in ('md', 'txt', 'json') then output_json #>> '{export_options,format}'
    when output_json ->> 'export_format' in ('md', 'txt', 'json') then output_json ->> 'export_format'
    else export_format
  end,
  export_generated_at = case
    when output_json ->> 'export_generated_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (output_json ->> 'export_generated_at')::timestamptz
    else created_at
  end,
  export_generated_at_display = coalesce(output_json ->> 'export_generated_at_display', export_generated_at_display);

alter table public.audit_events
  drop constraint if exists audit_events_project_id_fkey,
  add constraint audit_events_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete set null;

drop policy if exists "authenticated upload source documents" on storage.objects;
drop policy if exists "authenticated upload artifact images" on storage.objects;
drop policy if exists "authenticated upload output packages" on storage.objects;
drop policy if exists "authenticated read controlled storage" on storage.objects;
drop policy if exists "users insert own controlled storage objects" on storage.objects;
drop policy if exists "users read own controlled storage objects" on storage.objects;
drop policy if exists "users update own controlled storage objects" on storage.objects;
drop policy if exists "users delete own controlled storage objects" on storage.objects;

create policy "users insert own controlled storage objects" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('source-documents', 'artifact-images', 'output-packages')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users read own controlled storage objects" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('source-documents', 'artifact-images', 'output-packages')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update own controlled storage objects" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('source-documents', 'artifact-images', 'output-packages')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('source-documents', 'artifact-images', 'output-packages')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete own controlled storage objects" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('source-documents', 'artifact-images', 'output-packages')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
