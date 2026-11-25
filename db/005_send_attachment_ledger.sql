do $do$
declare d text; n1 int; n2 int;
begin
  if to_regprocedure('public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid)') is null then raise exception 'send_attachment signature changed'; end if;
  d := pg_get_functiondef('public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid)'::regprocedure);
  n1 := regexp_count(d, 'if\s+coalesce\(p_size,\s*0\)\s*<\s*1\s+or\s+p_size\s*>\s*26214400\s+then\s+return\s+jsonb_build_object\(.ok., false, .error., .Files can be up to 25 MB\..\);\s+end\s+if;');
  n2 := regexp_count(d, 'application/octet-stream.\),\s*100\),\s*p_size\)');
  if n1 <> 1 or n2 <> 1 then raise exception 'anchors not exactly one (size %, insert %), nothing changed', n1, n2; end if;
  d := regexp_replace(d, 'if\s+coalesce\(p_size,\s*0\)\s*<\s*1\s+or\s+p_size\s*>\s*26214400\s+then\s+return\s+jsonb_build_object\(.ok., false, .error., .Files can be up to 25 MB\..\);\s+end\s+if;',
    'if not exists (select 1 from public.upload_ledger where path = p_path and user_id = me and status in (''reserved'',''confirmed'')) then return jsonb_build_object(''ok'', false, ''error'', ''Upload not reserved. Reload and try again.''); end if; update public.upload_ledger set status = ''confirmed'' where path = p_path and user_id = me;');
  d := regexp_replace(d, 'application/octet-stream.\),\s*100\),\s*p_size\)',
    'application/octet-stream''), 100), (select bytes from public.upload_ledger where path = p_path and user_id = me))');
  alter table public.message_attachments add column if not exists expired_at timestamptz;
  execute d;
end $do$;
revoke execute on function public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid) from public, anon;
grant execute on function public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid) to authenticated;
select jsonb_build_object(
 'no_25mb', (select prosrc !~ '26214400' from pg_proc where oid = 'public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid)'::regprocedure),
 'ledger', (select prosrc ~ 'upload_ledger' from pg_proc where oid = 'public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid)'::regprocedure),
 'expired_col', (select count(*) from information_schema.columns where table_schema='public' and table_name='message_attachments' and column_name='expired_at'),
 'fn_anon', has_function_privilege('anon','public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid)','execute'),
 'fn_auth', has_function_privilege('authenticated','public.send_attachment(uuid,text,text,text,bigint,text,uuid,uuid)','execute'));
