create or replace function public.get_org_invite_policy(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.org_invites; pol public.org_policies; oname text; mine boolean;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select * into i from public.org_invites where id = p_id;
  if i.id is null then return public.org_err('Invitation not found or expired.'); end if;
  if i.status <> 'pending' or i.expires_at <= now() then return public.org_err('Invitation not found or expired.'); end if;
  mine := coalesce(i.user_id = me, false) or coalesce(i.email = public.org_email(me), false);
  if not mine then return public.org_err('Invitation not found or expired.'); end if;
  select * into pol from public.org_policies where org_id = i.org_id;
  if pol.policy_text is null or coalesce(pol.policy_version, 0) = 0 then return public.org_err('This organization has no policy to accept.'); end if;
  select name into oname from public.organizations where id = i.org_id;
  return public.org_ok(jsonb_build_object('org_id', i.org_id, 'org_name', oname, 'policy_text', pol.policy_text, 'policy_version', pol.policy_version));
end $$;
revoke all on function public.get_org_invite_policy(uuid) from public, anon, authenticated;
grant execute on function public.get_org_invite_policy(uuid) to authenticated;
select jsonb_build_object(
 'overloads', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_org_invite_policy'),
 'fn_auth', (select has_function_privilege('authenticated', oid, 'execute') from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_org_invite_policy'),
 'fn_anon', (select has_function_privilege('anon', oid, 'execute') from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_org_invite_policy'),
 'definer', (select prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_org_invite_policy'),
 'path', (select proconfig::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_org_invite_policy'),
 'pending_invites', (select count(*) from public.org_invites where status = 'pending' and expires_at > now()),
 'orgs_with_policy', (select count(*) from public.org_policies where policy_text is not null and policy_version > 0)
) as verify;
