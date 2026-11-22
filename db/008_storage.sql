insert into storage.buckets (id, name, public, file_size_limit)
  values ('chat-files', 'chat-files', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = 26214400;

create or replace function public.chat_file_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_member(split_part(p_name, '/', 1)::uuid)
    else false end
$$;
revoke all on function public.chat_file_ok(text) from public, anon, authenticated;
grant execute on function public.chat_file_ok(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat_files_read') then
    create policy chat_files_read on storage.objects for select to authenticated
      using (bucket_id = 'chat-files' and public.chat_file_ok(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat_files_write') then
    create policy chat_files_write on storage.objects for insert to authenticated
      with check (bucket_id = 'chat-files' and public.chat_file_ok(name));
  end if;
end $$;
select jsonb_build_object('bucket', (select id || ':' || public::text from storage.buckets where id = 'chat-files'),
  'pol', (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('chat_files_read', 'chat_files_write'))) as verify;
