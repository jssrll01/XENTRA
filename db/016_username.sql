create or replace function public.username_available(p_name text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := lower(btrim(coalesce(p_name, '')));
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if n !~ '^[a-z0-9_.]{3,20}$' then return public.jerr('3 to 20 characters: letters, numbers, dot or underscore.'); end if;
  return public.jok(jsonb_build_object('available', not exists (select 1 from public.profiles where lower(username) = n and id <> me)));
end $$;
revoke all on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to authenticated;
select jsonb_build_object(
  'auth_exec', has_function_privilege('authenticated', 'public.username_available(text)', 'execute'),
  'anon_exec', has_function_privilege('anon', 'public.username_available(text)', 'execute'),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute'))
) as verify;
