begin;
insert into public.app_config (key, value, is_public) values
 ('schedule_max_days','90'::jsonb,false),
 ('reminder_max_days','365'::jsonb,false),
 ('presence_online_seconds','90'::jsonb,false),
 ('push_function_url','"https://xdgrtksmogwigoopqokv.supabase.co/functions/v1/push-send"'::jsonb,false)
on conflict (key) do nothing;

create or replace function public.cfg_req(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  select value into v from public.app_config where key = p_key;
  if v is null then raise exception 'Missing app_config key: %', p_key; end if;
  return v;
end $$;
revoke execute on function public.cfg_req(text) from public, anon, authenticated;

do $$
declare
  r record; o oid; n int; def text; cnt int;
begin
  for r in select * from (values
    ('schedule_message', 'interval ''90 days''', 'make_interval(days => (public.cfg_req(''schedule_max_days'') #>> ''{}'')::int)'),
    ('update_scheduled_time', 'interval ''90 days''', 'make_interval(days => (public.cfg_req(''schedule_max_days'') #>> ''{}'')::int)'),
    ('create_reminder', 'interval ''1 year''', 'make_interval(days => (public.cfg_req(''reminder_max_days'') #>> ''{}'')::int)'),
    ('get_presence_raw', 'interval ''90 seconds''', 'make_interval(secs => (public.cfg_req(''presence_online_seconds'') #>> ''{}'')::int)'),
    ('notif_send_push', '''https://xdgrtksmogwigoopqokv.supabase.co/functions/v1/push-send''', '(public.cfg_req(''push_function_url'') #>> ''{}'')')
  ) as t(fn, old, new) loop
    select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname = r.fn;
    if n <> 1 then raise exception '% has % overloads', r.fn, n; end if;
    select oid into o from pg_proc where pronamespace = 'public'::regnamespace and proname = r.fn;
    if not (select prosecdef from pg_proc where oid = o) then raise exception '% is not security definer', r.fn; end if;
    def := pg_get_functiondef(o);
    cnt := (length(def) - length(replace(def, r.old, ''))) / length(r.old);
    if cnt <> 1 then raise exception '% literal found % times', r.fn, cnt; end if;
    execute replace(def, r.old, r.new);
  end loop;
end $$;
commit;

select jsonb_build_object(
 'keys', (select count(*) from public.app_config where key in ('schedule_max_days','reminder_max_days','presence_online_seconds','push_function_url')),
 'left', (select coalesce(string_agg(proname,','),'none') from pg_proc where pronamespace='public'::regnamespace and proname in ('schedule_message','update_scheduled_time','create_reminder','get_presence_raw','notif_send_push') and (prosrc like '%interval ''90 days''%' or prosrc like '%interval ''1 year''%' or prosrc like '%interval ''90 seconds''%' or prosrc like '%supabase.co/functions%')),
 'anon_exec', (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('cfg_req','schedule_message','update_scheduled_time','create_reminder','get_presence_raw','notif_send_push') and has_function_privilege('anon',oid,'execute')),
 'auth_exec', (select jsonb_object_agg(proname, has_function_privilege('authenticated',oid,'execute')) from pg_proc where pronamespace='public'::regnamespace and proname in ('cfg_req','schedule_message','update_scheduled_time','create_reminder','get_presence_raw','notif_send_push')));
