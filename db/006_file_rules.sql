do $do$
declare d text; n int;
begin
  d := pg_get_functiondef(to_regprocedure('public.list_messages(uuid,timestamptz,integer)'));
  if d is null then raise exception 'list_messages signature unexpected'; end if;
  n := regexp_count(d, '''size'', a\.size\)');
  if n <> 1 then raise exception 'list_messages anchor count %, nothing changed', n; end if;
end $do$;

do $do$
declare d text;
begin
  d := pg_get_functiondef(to_regprocedure('public.list_messages(uuid,timestamptz,integer)'));
  d := regexp_replace(d, '''size'', a\.size\)', '''size'', a.size, ''expired_at'', a.expired_at)');
  execute d;
end $do$;

update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array(select jsonb_array_elements_text(public.cfg('image_mime','[]'::jsonb) || public.cfg('doc_mime','[]'::jsonb)))
  where id = 'chat-files';

create or replace function public.chat_file_ok(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_member(split_part(p_name, '/', 1)::uuid) else false end
$f$;

create or replace function public.chat_file_write_ok(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select public.chat_file_ok(p_name) and exists (select 1 from public.upload_ledger where path = p_name and user_id = auth.uid())
$f$;
revoke all on function public.chat_file_write_ok(text) from public, anon;
grant execute on function public.chat_file_write_ok(text) to authenticated;

drop policy if exists chat_files_write on storage.objects;
create policy chat_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and public.chat_file_write_ok(name));

create or replace function public.expire_chat_files() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare a int; q int; rel int;
begin
  update public.message_attachments set expired_at = now()
    where expired_at is null and created_at < now() - interval '24 hours';
  get diagnostics a = row_count;
  insert into public.file_purge_queue(path, bucket)
    select o.name, 'chat-files' from storage.objects o
    where o.bucket_id = 'chat-files' and o.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.file_purge_queue f where f.path = o.name and f.bucket = 'chat-files');
  get diagnostics q = row_count;
  delete from public.upload_ledger where status = 'reserved' and created_at < now() - interval '15 minutes';
  get diagnostics rel = row_count;
  return jsonb_build_object('expired', a, 'queued', q, 'released', rel);
end $f$;
revoke all on function public.expire_chat_files() from public, anon, authenticated;

do $do$ begin perform cron.schedule('xentra_expire_files', '5 * * * *', 'select public.expire_chat_files()'); end $do$;

select jsonb_build_object(
 'bucket', (select jsonb_build_object('size', file_size_limit, 'mimes', coalesce(array_length(allowed_mime_types,1),0)) from storage.buckets where id='chat-files'),
 'policy', (select count(*) from pg_policies where schemaname='storage' and policyname='chat_files_write'),
 'list_expired', (select prosrc ~ 'expired_at' from pg_proc where oid = to_regprocedure('public.list_messages(uuid,timestamptz,integer)')),
 'cron', (select schedule from cron.job where jobname='xentra_expire_files'),
 'fn_anon', has_function_privilege('anon','public.expire_chat_files()','execute'),
 'fn_auth', has_function_privilege('authenticated','public.expire_chat_files()','execute'),
 'wr_anon', has_function_privilege('anon','public.chat_file_write_ok(text)','execute'));
