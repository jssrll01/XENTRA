begin;
do $do$ begin
  if to_regprocedure('public.get_my_details()') is null or to_regprocedure('public.get_public_profile_raw(text)') is null then raise exception 'profile function signature changed'; end if;
  if to_regprocedure('public.set_my_banner(text)') is not null then raise exception 'already applied'; end if;
end $do$;
alter table public.profile_details add column if not exists banner_url text check (banner_url is null or char_length(banner_url) <= 500);
alter table public.profile_details add column if not exists banner_changed_at timestamptz;
insert into public.app_config(key, value, is_public) values ('banner_cooldown_days', '7'::jsonb, false) on conflict (key) do nothing;

create function public.set_my_banner(p_url text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); u text := nullif(btrim(coalesce(p_url, '')), ''); c text := public.cfg('cloudinary_cloud') #>> '{}'; v jsonb := public.cfg('banner_cooldown_days'); d int; lastc timestamptz;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if v is null then return jsonb_build_object('ok', false, 'error', 'Settings are unavailable.'); end if;
  d := (v #>> '{}')::int;
  if u is not null then
    if c is null then return jsonb_build_object('ok', false, 'error', 'Settings are unavailable.'); end if;
    if char_length(u) > 500 or left(u, char_length('https://res.cloudinary.com/' || c || '/')) <> 'https://res.cloudinary.com/' || c || '/' then return jsonb_build_object('ok', false, 'error', 'Invalid image address.'); end if;
    select banner_changed_at into lastc from public.profile_details where user_id = me;
    if lastc is not null and lastc > now() - make_interval(days => d) then
      return jsonb_build_object('ok', false, 'error', 'You can change your banner again on ' || to_char(lastc + make_interval(days => d), 'Mon DD, YYYY') || '.');
    end if;
  end if;
  insert into public.profile_details(user_id, banner_url, banner_changed_at) values (me, u, case when u is not null then now() end)
    on conflict (user_id) do update set banner_url = excluded.banner_url,
      banner_changed_at = case when u is not null then now() else public.profile_details.banner_changed_at end, updated_at = now();
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $f$;
revoke all on function public.set_my_banner(text) from public, anon;
grant execute on function public.set_my_banner(text) to authenticated;

do $do$
declare d text; n1 int; n2 int;
begin
  d := pg_get_functiondef('public.get_my_details()'::regprocedure);
  n1 := regexp_count(d, '''verified'', p\.verified\)');
  if n1 <> 1 then raise exception 'get_my_details anchor count %, nothing changed', n1; end if;
  d := regexp_replace(d, '''verified'', p\.verified\)', '''verified'', p.verified, ''banner_url'', d.banner_url, ''banner_next_at'', (d.banner_changed_at + make_interval(days => (public.cfg(''banner_cooldown_days'') #>> ''{}'')::int)))');
  execute d;
  d := pg_get_functiondef('public.get_public_profile_raw(text)'::regprocedure);
  n2 := regexp_count(d, '''cover'', d\.cover,');
  if n2 <> 1 then raise exception 'get_public_profile_raw anchor count %, nothing changed', n2; end if;
  d := regexp_replace(d, '''cover'', d\.cover,', '''cover'', d.cover, ''banner_url'', case when public.priv_allowed(t.id, me, ''photo'') then d.banner_url else null end,');
  execute d;
end $do$;
commit;

select jsonb_build_object(
 'cols', (select count(*) from information_schema.columns where table_schema='public' and table_name='profile_details' and column_name in ('banner_url','banner_changed_at')),
 'cfg', (select value from public.app_config where key='banner_cooldown_days'),
 'gmd_has', (select prosrc ~ 'banner_url' from pg_proc where oid='public.get_my_details()'::regprocedure),
 'raw_has', (select prosrc ~ 'banner_url' from pg_proc where oid='public.get_public_profile_raw(text)'::regprocedure),
 'set_anon', has_function_privilege('anon','public.set_my_banner(text)','execute'),
 'set_auth', has_function_privilege('authenticated','public.set_my_banner(text)','execute'),
 'gmd_anon', has_function_privilege('anon','public.get_my_details()','execute'),
 'gmd_auth', has_function_privilege('authenticated','public.get_my_details()','execute'),
 'raw_auth', has_function_privilege('authenticated','public.get_public_profile_raw(text)','execute'),
 'pd_select', has_table_privilege('authenticated','public.profile_details','select'));
