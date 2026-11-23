begin;
do $$
declare rt text; a text;
begin
  select pg_get_function_result(oid), pg_get_function_identity_arguments(oid) into rt, a
    from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_avatar';
  if rt is distinct from 'jsonb' or a is distinct from 'p_url text' then
    raise exception 'set_avatar unexpected: % / %', rt, a;
  end if;
  if to_regprocedure('public.set_avatar_raw(text)') is not null then
    raise exception 'set_avatar_raw already exists';
  end if;
end $$;

alter table public.profiles add column if not exists avatar_changed_at timestamptz;
insert into public.app_config (key, value, is_public) values ('avatar_cooldown_days', '7'::jsonb, true) on conflict (key) do nothing;

alter function public.set_avatar(text) rename to set_avatar_raw;
revoke execute on function public.set_avatar_raw(text) from public, anon, authenticated;

create function public.set_avatar(p_url text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); v jsonb := public.cfg('avatar_cooldown_days'); d int; lastc timestamptz; r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if v is null then return jsonb_build_object('ok', false, 'error', 'Settings are unavailable.'); end if;
  d := (v #>> '{}')::int;
  if p_url is not null then
    select avatar_changed_at into lastc from public.profiles where id = me;
    if lastc is not null and lastc > now() - make_interval(days => d) then
      return jsonb_build_object('ok', false, 'error', 'You can change your photo again on ' || to_char(lastc + make_interval(days => d), 'Mon DD, YYYY') || '.');
    end if;
  end if;
  r := public.set_avatar_raw(p_url);
  if (r ->> 'ok') = 'true' and p_url is not null then
    update public.profiles set avatar_changed_at = now() where id = me;
  end if;
  return r;
end $$;

create function public.avatar_cooldown() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); v jsonb := public.cfg('avatar_cooldown_days'); lastc timestamptz; nxt timestamptz;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if v is null then return jsonb_build_object('ok', false, 'error', 'Settings are unavailable.'); end if;
  select avatar_changed_at into lastc from public.profiles where id = me;
  nxt := lastc + make_interval(days => (v #>> '{}')::int);
  if nxt is not null and nxt <= now() then nxt := null; end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('next_at', nxt));
end $$;

revoke execute on function public.set_avatar(text), public.avatar_cooldown() from public, anon;
grant execute on function public.set_avatar(text), public.avatar_cooldown() to authenticated;
commit;

select jsonb_build_object(
 'col', (select count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_changed_at'),
 'col_auth_select', has_column_privilege('authenticated','public.profiles','avatar_changed_at','select'),
 'cfg', (select value from public.app_config where key='avatar_cooldown_days'),
 'fn', (select jsonb_agg(p.proname||':'||has_function_privilege('anon',p.oid,'execute')::text||'/'||has_function_privilege('authenticated',p.oid,'execute')::text order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('set_avatar','set_avatar_raw','avatar_cooldown')));
