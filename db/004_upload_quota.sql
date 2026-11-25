begin;
do $$ begin
  if to_regclass('public.upload_ledger') is not null then raise exception 'upload_ledger exists, nothing applied'; end if;
end $$;

create table public.upload_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('image','doc')),
  bytes bigint not null check (bytes > 0),
  path text not null,
  status text not null default 'reserved' check (status in ('reserved','confirmed')),
  created_at timestamptz not null default now()
);
create index upload_ledger_user_idx on public.upload_ledger (user_id, category, created_at desc);
create unique index upload_ledger_path_key on public.upload_ledger (path);
alter table public.upload_ledger enable row level security;
revoke all on public.upload_ledger from public, anon, authenticated;

insert into public.app_config (key, value, is_public) values
 ('image_hour_bytes', '5242880'::jsonb, true),
 ('doc_hour_bytes', '10485760'::jsonb, true),
 ('image_ext', '["jpg","jpeg","png","webp","gif"]'::jsonb, true),
 ('doc_ext', '["pdf","docx","xlsx","pptx","txt","csv","zip"]'::jsonb, true),
 ('image_mime', '["image/jpeg","image/png","image/webp","image/gif"]'::jsonb, true),
 ('doc_mime', '["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv","application/zip","application/x-zip-compressed"]'::jsonb, true)
on conflict (key) do nothing;

create function public.reserve_upload(p_conversation uuid, p_name text, p_mime text, p_size bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); nm text; ext text; mt text := lower(btrim(coalesce(p_mime,''))); cat text;
  lim bigint; used bigint; need bigint; freed bigint := 0; wait_s int := null; r record; pth text; rid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if coalesce(p_size, 0) < 1 then return jsonb_build_object('ok', false, 'error', 'The file is empty.'); end if;
  nm := right(regexp_replace(btrim(coalesce(p_name,'')), '[^A-Za-z0-9._-]+', '_', 'g'), 80);
  ext := lower(substring(nm from '\.([A-Za-z0-9]+)$'));
  if ext is null or nm = '' then return jsonb_build_object('ok', false, 'error', 'This file type is not allowed.'); end if;
  if jsonb_exists(public.cfg('image_ext','[]'::jsonb), ext) and jsonb_exists(public.cfg('image_mime','[]'::jsonb), mt) then cat := 'image';
  elsif jsonb_exists(public.cfg('doc_ext','[]'::jsonb), ext) and jsonb_exists(public.cfg('doc_mime','[]'::jsonb), mt) then cat := 'doc';
  else return jsonb_build_object('ok', false, 'error', 'This file type is not allowed. Images and documents only; video and audio are not supported.'); end if;
  lim := (public.cfg(case cat when 'image' then 'image_hour_bytes' else 'doc_hour_bytes' end) #>> '{}')::bigint;
  if lim is null or lim < 1 then return jsonb_build_object('ok', false, 'error', 'Upload settings are unavailable.'); end if;
  if p_size > lim then return jsonb_build_object('ok', false, 'error', 'This file is larger than the ' || (lim / 1048576) || ' MB hourly limit for ' || (case cat when 'image' then 'images' else 'documents' end) || '.'); end if;
  perform pg_advisory_xact_lock(hashtext('upl:' || me::text || cat));
  select coalesce(sum(bytes), 0) into used from public.upload_ledger where user_id = me and category = cat and created_at > now() - interval '1 hour';
  if used + p_size > lim then
    need := used + p_size - lim;
    for r in select bytes, created_at from public.upload_ledger where user_id = me and category = cat and created_at > now() - interval '1 hour' order by created_at loop
      freed := freed + r.bytes;
      if freed >= need then wait_s := greatest(1, ceil(extract(epoch from (r.created_at + interval '1 hour' - now())))::int); exit; end if;
    end loop;
    return jsonb_build_object('ok', false, 'error', 'Hourly upload limit reached. Try again in ' || greatest(1, ceil(coalesce(wait_s, 3600) / 60.0))::int || ' min.');
  end if;
  pth := p_conversation::text || '/' || gen_random_uuid()::text || '-' || nm;
  insert into public.upload_ledger (user_id, category, bytes, path) values (me, cat, p_size, pth) returning id into rid;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', rid, 'path', pth, 'category', cat, 'remaining', lim - used - p_size));
end $f$;

create function public.confirm_upload(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.upload_ledger set status = 'confirmed' where id = p_id and user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'Upload not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $f$;

create function public.release_upload(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $f$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  delete from public.upload_ledger where id = p_id and user_id = auth.uid() and status = 'reserved';
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $f$;

create function public.get_upload_quota() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); li bigint; ld bigint; ui bigint; ud bigint;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  li := (public.cfg('image_hour_bytes') #>> '{}')::bigint; ld := (public.cfg('doc_hour_bytes') #>> '{}')::bigint;
  select coalesce(sum(bytes) filter (where category = 'image'), 0), coalesce(sum(bytes) filter (where category = 'doc'), 0) into ui, ud
    from public.upload_ledger where user_id = me and created_at > now() - interval '1 hour';
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('image_left', greatest(li - ui, 0), 'doc_left', greatest(ld - ud, 0), 'image_limit', li, 'doc_limit', ld));
end $f$;

revoke execute on function public.reserve_upload(uuid,text,text,bigint), public.confirm_upload(uuid), public.release_upload(uuid), public.get_upload_quota() from public, anon;
grant execute on function public.reserve_upload(uuid,text,text,bigint), public.confirm_upload(uuid), public.release_upload(uuid), public.get_upload_quota() to authenticated;
commit;

select jsonb_build_object(
 'rls', (select relrowsecurity from pg_class where oid = to_regclass('public.upload_ledger')),
 'tbl_auth', has_table_privilege('authenticated','public.upload_ledger','select'),
 'tbl_anon', has_table_privilege('anon','public.upload_ledger','select'),
 'keys', (select count(*) from public.app_config where key in ('image_hour_bytes','doc_hour_bytes','image_ext','doc_ext','image_mime','doc_mime')),
 'fn', (select jsonb_agg(p.proname||':'||has_function_privilege('anon',p.oid,'execute')::text||'/'||has_function_privilege('authenticated',p.oid,'execute')::text order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('reserve_upload','confirm_upload','release_upload','get_upload_quota')));
