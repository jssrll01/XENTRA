begin;
do $$ begin
  if to_regprocedure('public.org_can(uuid,uuid,text)') is null then raise exception 'run 007 first'; end if;
  if to_regprocedure('public.create_org_invite(uuid,text,text,integer)') is not null then raise exception 'already applied'; end if;
end $$;
insert into public.app_config(key, value, is_public) values ('org_invite_default_days', '7'::jsonb, false), ('org_invite_max_days', '30'::jsonb, false) on conflict (key) do nothing;

create function public.org_join_guard(p_org uuid, p_user uuid) returns text language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare pol public.org_policies; dom text := split_part(coalesce(public.org_email(p_user), ''), '@', 2);
begin
  select * into pol from public.org_policies where org_id = p_org;
  if pol.org_id is null then return 'Organization not found.'; end if;
  if cardinality(pol.allowed_domains) > 0 and not (dom = any(pol.allowed_domains)) then return 'Your email domain is not allowed in this organization.'; end if;
  if pol.policy_text is not null and pol.policy_version > 0 and not exists (select 1 from public.org_policy_accepts where org_id = p_org and user_id = p_user and version = pol.policy_version) then return 'POLICY_REQUIRED'; end if;
  return null;
end $f$;

create function public.org_invite_allowed(p_org uuid, p_user uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $f$
  select public.org_can(p_org, p_user, 'manage_invitations')
    or coalesce((select public.org_rank(public.org_role(p_org, p_user)) >= case pol.who_can_invite when 'members' then 0 when 'managers' then 1 else 2 end from public.org_policies pol where pol.org_id = p_org), false)
$f$;

create function public.create_org_invite(p_org uuid, p_username text, p_email text, p_days integer) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); u text := lower(btrim(coalesce(p_username, ''))); em text := lower(btrim(coalesce(p_email, ''))); tid uuid; dmax int; dd int; iid uuid; oname text;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_invite_allowed(p_org, me) then return public.org_err('You cannot invite people to this organization.'); end if;
  if (u = '') = (em = '') then return public.org_err('Enter a username or an email, not both.'); end if;
  dmax := (public.cfg('org_invite_max_days') #>> '{}')::int; dd := coalesce(p_days, (public.cfg('org_invite_default_days') #>> '{}')::int);
  if dmax is null or dd is null then return public.org_err('Settings are unavailable.'); end if;
  if dd < 1 or dd > dmax then return public.org_err('Expiry is 1 to ' || dmax || ' days.'); end if;
  select name into oname from public.organizations where id = p_org;
  if u <> '' then
    select id into tid from public.profiles where username = u;
    if tid is null then return public.org_err('No user with that username.'); end if;
  else
    if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return public.org_err('Enter a valid email.'); end if;
    select id into tid from auth.users where lower(email) = em limit 1;
  end if;
  if tid is not null and public.org_role(p_org, tid) is not null then return public.org_err('They are already a member.'); end if;
  if exists (select 1 from public.org_invites where org_id = p_org and status = 'pending' and expires_at > now() and ((tid is not null and user_id = tid) or (tid is null and lower(email) = em))) then return public.org_err('An invitation is already pending.'); end if;
  insert into public.org_invites(org_id, kind, user_id, email, invited_by, expires_at)
    values (p_org, case when u <> '' then 'user' else 'email' end, tid, case when u <> '' then null else em end, me, now() + make_interval(days => dd)) returning id into iid;
  if tid is not null then perform public.org_notify(tid, 'Organization invitation', 'You were invited to join ' || oname || '.', '/organizations'); end if;
  perform public.org_log(p_org, me, 'invited', coalesce(nullif(u, ''), em));
  return public.org_ok(jsonb_build_object('id', iid, 'notified', tid is not null));
end $f$;

create function public.list_org_invites(p_org uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_invite_allowed(p_org, me) then return public.org_err('You cannot view invitations.'); end if;
  return public.org_ok(coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'target', coalesce('@' || p.username, i.email), 'expires_at', i.expires_at) order by i.created_at desc)
    from public.org_invites i left join public.profiles p on p.id = i.user_id where i.org_id = p_org and i.status = 'pending' and i.expires_at > now()), '[]'::jsonb));
end $f$;

create function public.revoke_org_invite(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); o uuid;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select org_id into o from public.org_invites where id = p_id and status = 'pending';
  if o is null or not public.org_invite_allowed(o, me) then return public.org_err('Invitation not found.'); end if;
  update public.org_invites set status = 'revoked' where id = p_id;
  perform public.org_log(o, me, 'revoked invite', p_id::text);
  return public.org_ok();
end $f$;

create function public.regenerate_org_code(p_org uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); c text := substr(md5(gen_random_uuid()::text), 1, 12);
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_invitations') then return public.org_err('You cannot manage invitations.'); end if;
  update public.organizations set invite_code = c where id = p_org;
  perform public.org_log(p_org, me, 'new invite link', '');
  return public.org_ok(jsonb_build_object('code', c));
end $f$;

create function public.set_org_invite_enabled(p_org uuid, p_on boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_invitations') then return public.org_err('You cannot manage invitations.'); end if;
  update public.organizations set invite_enabled = coalesce(p_on, false) where id = p_org;
  perform public.org_log(p_org, me, 'invite link', case when p_on then 'on' else 'off' end);
  return public.org_ok();
end $f$;

create function public.list_my_org_invites() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  return public.org_ok(coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'org_id', i.org_id, 'org_name', o.name, 'expires_at', i.expires_at,
    'from', (select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.username) from public.profiles p where p.id = i.invited_by)) order by i.created_at desc)
    from public.org_invites i join public.organizations o on o.id = i.org_id
    where i.status = 'pending' and i.expires_at > now() and (i.user_id = me or (i.email is not null and i.email = public.org_email(me)))), '[]'::jsonb));
end $f$;

create function public.respond_org_invite(p_id uuid, p_accept boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); i public.org_invites; g text; oname text;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select * into i from public.org_invites where id = p_id;
  if i.id is null or i.status <> 'pending' or i.expires_at <= now() then return public.org_err('Invitation not found or expired.'); end if;
  if not coalesce(i.user_id = me, false) and not coalesce(i.email = public.org_email(me), false) then return public.org_err('Invitation not found or expired.'); end if;
  if not coalesce(p_accept, false) then
    update public.org_invites set status = 'declined' where id = p_id;
    return public.org_ok();
  end if;
  if public.org_role(i.org_id, me) is null then
    g := public.org_join_guard(i.org_id, me);
    if g is not null then return jsonb_build_object('ok', false, 'error', case when g = 'POLICY_REQUIRED' then 'Accept the organization policy first.' else g end, 'code', g); end if;
    insert into public.org_members(org_id, user_id, role) values (i.org_id, me, 'member');
    perform public.org_log(i.org_id, me, 'joined', 'invitation');
    select name into oname from public.organizations where id = i.org_id;
    if i.invited_by is not null then perform public.org_notify(i.invited_by, 'Invitation accepted', 'Someone joined ' || oname || '.', '/organizations'); end if;
  end if;
  update public.org_invites set status = 'accepted' where id = p_id;
  return public.org_ok(jsonb_build_object('org_id', i.org_id));
end $f$;

create function public.preview_org(p_code text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); o public.organizations; pol public.org_policies;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select * into o from public.organizations where invite_code = btrim(coalesce(p_code, '')) and invite_enabled;
  if o.id is null then return public.org_err('This invite link is not valid.'); end if;
  select * into pol from public.org_policies where org_id = o.id;
  return public.org_ok(jsonb_build_object('id', o.id, 'name', o.name, 'description', o.description, 'logo_url', o.logo_url,
    'members', (select count(*) from public.org_members where org_id = o.id),
    'is_member', public.org_role(o.id, me) is not null,
    'requested', exists (select 1 from public.org_join_requests where org_id = o.id and user_id = me and status = 'pending'),
    'needs_approval', pol.invite_approval,
    'policy_text', pol.policy_text, 'policy_version', pol.policy_version,
    'policy_accepted', pol.policy_text is null or pol.policy_version = 0 or exists (select 1 from public.org_policy_accepts where org_id = o.id and user_id = me and version = pol.policy_version)));
end $f$;

create function public.accept_org_policy(p_org uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); v int;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select policy_version into v from public.org_policies where org_id = p_org and policy_text is not null and policy_version > 0;
  if v is null then return public.org_err('This organization has no policy to accept.'); end if;
  insert into public.org_policy_accepts(org_id, user_id, version) values (p_org, me, v) on conflict do nothing;
  return public.org_ok(jsonb_build_object('version', v));
end $f$;

create function public.join_org_by_code(p_code text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); o public.organizations; pol public.org_policies; g text; m record;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select * into o from public.organizations where invite_code = btrim(coalesce(p_code, '')) and invite_enabled;
  if o.id is null then return public.org_err('This invite link is not valid.'); end if;
  if public.org_role(o.id, me) is not null then return public.org_ok(jsonb_build_object('status', 'joined', 'id', o.id)); end if;
  g := public.org_join_guard(o.id, me);
  if g is not null then return jsonb_build_object('ok', false, 'error', case when g = 'POLICY_REQUIRED' then 'Accept the organization policy first.' else g end, 'code', g); end if;
  select * into pol from public.org_policies where org_id = o.id;
  if pol.invite_approval then
    insert into public.org_join_requests(org_id, user_id, status) values (o.id, me, 'pending') on conflict (org_id, user_id) do update set status = 'pending', created_at = now();
    for m in select user_id from public.org_members where org_id = o.id loop
      if public.org_can(o.id, m.user_id, 'manage_invitations') then perform public.org_notify(m.user_id, 'Join request', 'Someone asked to join ' || o.name || '.', '/organizations'); end if;
    end loop;
    return public.org_ok(jsonb_build_object('status', 'requested', 'id', o.id));
  end if;
  insert into public.org_members(org_id, user_id, role) values (o.id, me, 'member');
  perform public.org_log(o.id, me, 'joined', 'link');
  return public.org_ok(jsonb_build_object('status', 'joined', 'id', o.id));
end $f$;

create function public.list_org_join_requests(p_org uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_invitations') then return public.org_err('You cannot view requests.'); end if;
  return public.org_ok(coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'created_at', r.created_at) order by r.created_at)
    from public.org_join_requests r join public.profiles p on p.id = r.user_id where r.org_id = p_org and r.status = 'pending'), '[]'::jsonb));
end $f$;

create function public.respond_org_join_request(p_org uuid, p_user uuid, p_accept boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); g text; nm text;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_invitations') then return public.org_err('You cannot manage requests.'); end if;
  if not exists (select 1 from public.org_join_requests where org_id = p_org and user_id = p_user and status = 'pending') then return public.org_err('Request not found.'); end if;
  select name into nm from public.organizations where id = p_org;
  if coalesce(p_accept, false) then
    g := public.org_join_guard(p_org, p_user);
    if g is not null and g <> 'POLICY_REQUIRED' then return public.org_err(g); end if;
    insert into public.org_members(org_id, user_id, role) values (p_org, p_user, 'member') on conflict do nothing;
    update public.org_join_requests set status = 'accepted' where org_id = p_org and user_id = p_user;
    perform public.org_notify(p_user, 'Request approved', 'You joined ' || nm || '.', '/organizations');
    perform public.org_log(p_org, me, 'approved', p_user::text);
  else
    update public.org_join_requests set status = 'declined' where org_id = p_org and user_id = p_user;
    perform public.org_notify(p_user, 'Request declined', 'Your request to join ' || nm || ' was declined.', '/organizations');
    perform public.org_log(p_org, me, 'declined', p_user::text);
  end if;
  return public.org_ok();
end $f$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace loop
    if r.proname = any(array['create_org_invite','list_org_invites','revoke_org_invite','regenerate_org_code','set_org_invite_enabled','list_my_org_invites','respond_org_invite','preview_org','accept_org_policy','join_org_by_code','list_org_join_requests','respond_org_join_request']) then
      execute 'revoke all on function ' || r.sig || ' from public, anon'; execute 'grant execute on function ' || r.sig || ' to authenticated';
    elsif r.proname = any(array['org_join_guard','org_invite_allowed']) then
      execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    end if;
  end loop;
end $$;
commit;

select jsonb_build_object(
 'client_ok', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(array['create_org_invite','list_org_invites','revoke_org_invite','regenerate_org_code','set_org_invite_enabled','list_my_org_invites','respond_org_invite','preview_org','accept_org_policy','join_org_by_code','list_org_join_requests','respond_org_join_request']) and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')),
 'helpers_open', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(array['org_join_guard','org_invite_allowed']) and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'))),
 'cfg_keys', (select count(*) from public.app_config where key in ('org_invite_default_days','org_invite_max_days')));
