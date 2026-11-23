begin;

do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('cfg','get_app_config','set_app_config','get_signup_config'))
     or to_regclass('public.app_config') is not null then
    raise exception 'app_config objects already exist, nothing applied';
  end if;
end $$;

create table public.app_config (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint app_config_key_fmt check (key ~ '^[a-z0-9_]{2,60}$')
);
alter table public.app_config enable row level security;
revoke all on public.app_config from public, anon, authenticated;

create function public.cfg(p_key text, p_default jsonb default null) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.app_config where key = p_key), p_default)
$$;

create function public.get_app_config() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  return jsonb_build_object('ok', true, 'data',
    coalesce((select jsonb_object_agg(key, value) from public.app_config where is_public), '{}'::jsonb));
end $$;

create function public.get_signup_config() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare d jsonb := public.cfg('allowed_email_domains');
begin
  if d is null then return jsonb_build_object('ok', false, 'error', 'Sign-up settings are unavailable.'); end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('allowed_email_domains', d));
end $$;

create function public.set_app_config(p_key text, p_value jsonb, p_public boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_key is null or p_key !~ '^[a-z0-9_]{2,60}$' or p_value is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid key or value.');
  end if;
  insert into public.app_config (key, value, is_public) values (p_key, p_value, coalesce(p_public, false))
  on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

revoke execute on function public.cfg(text, jsonb) from public, anon, authenticated;
revoke execute on function public.get_app_config() from public, anon, authenticated;
revoke execute on function public.set_app_config(text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.get_signup_config() from public;
grant execute on function public.get_app_config() to authenticated;
grant execute on function public.set_app_config(text, jsonb, boolean) to service_role;
grant execute on function public.get_signup_config() to anon, authenticated;

insert into public.app_config (key, value, is_public) values
 ('cloudinary_cloud', '"bvw3okdf"'::jsonb, true),
 ('cloudinary_preset', '"xmarket_user_profile"'::jsonb, true),
 ('avatar_max_bytes', '5242880'::jsonb, true),
 ('file_max_bytes', '26214400'::jsonb, true),
 ('allowed_email_domains', '["gmail.com"]'::jsonb, true),
 ('vapid_public_key', to_jsonb('BPwpELfvhWq492rRLSg64SOAEaO7wONv59Cp2p3j_zScUqkj1vACSXeg8C35SbQtSMANp-rLOEiFxAUiJXWKjio'::text), true)
on conflict (key) do nothing;

commit;
select jsonb_build_object(
 'rls', (select relrowsecurity from pg_class where oid = to_regclass('public.app_config')),
 'tbl_auth_select', has_table_privilege('authenticated','public.app_config','select'),
 'tbl_anon_select', has_table_privilege('anon','public.app_config','select'),
 'rows', (select count(*) from public.app_config),
 'public_keys', (select string_agg(key, ',' order by key) from public.app_config where is_public),
 'vapid_len', (select length(value #>> '{}') from public.app_config where key = 'vapid_public_key'),
 'fn', (select jsonb_agg(p.proname||':'||has_function_privilege('anon',p.oid,'execute')::text||'/'||has_function_privilege('authenticated',p.oid,'execute')::text||'/'||has_function_privilege('service_role',p.oid,'execute')::text order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('cfg','get_app_config','set_app_config','get_signup_config')));
