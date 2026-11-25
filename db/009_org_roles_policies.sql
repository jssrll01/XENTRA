begin;
do $$ begin
  if to_regprocedure('public.org_join_guard(uuid,uuid)') is null then raise exception 'run 008 first'; end if;
  if to_regprocedure('public.save_org_role(uuid,uuid,text,text[])') is not null then raise exception 'already applied'; end if;
end $$;

create function public.list_org_roles(p_org uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if public.org_role(p_org, me) is null then return public.org_err('Organization not found.'); end if;
  return public.org_ok(jsonb_build_object('all', public.org_perms(),
    'builtin', jsonb_build_object(
      'admin', coalesce((select perms from public.org_builtin_perms where org_id = p_org and role = 'admin'), public.org_default_perms('admin')),
      'manager', coalesce((select perms from public.org_builtin_perms where org_id = p_org and role = 'manager'), public.org_default_perms('manager')),
      'member', coalesce((select perms from public.org_builtin_perms where org_id = p_org and role = 'member'), public.org_default_perms('member'))),
    'custom', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'perms', r.perms, 'members', (select count(*) from public.org_members m where m.custom_role = r.id)) order by lower(r.name))
      from public.org_roles r where r.org_id = p_org), '[]'::jsonb)));
end $f$;

create function public.set_org_builtin_perms(p_org uuid, p_role text, p_perms text[]) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); mr text := public.org_role(p_org, me); pp text[] := coalesce(p_perms, '{}'::text[]);
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_roles') then return public.org_err('You cannot manage roles.'); end if;
  if coalesce(p_role, '') not in ('admin','manager','member') then return public.org_err('Invalid role.'); end if;
  if public.org_rank(p_role) >= public.org_rank(mr) then return public.org_err('You can only edit roles below yours.'); end if;
  if not (pp <@ public.org_perms()) then return public.org_err('Unknown permission.'); end if;
  if exists (select 1 from unnest(pp) x where not public.org_can(p_org, me, x)) then return public.org_err('You cannot grant permissions you do not have.'); end if;
  insert into public.org_builtin_perms(org_id, role, perms) values (p_org, p_role, pp) on conflict (org_id, role) do update set perms = excluded.perms;
  perform public.org_log(p_org, me, 'permissions', p_role || ': ' || array_to_string(pp, ','));
  return public.org_ok();
end $f$;

create function public.save_org_role(p_org uuid, p_id uuid, p_name text, p_perms text[]) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); pp text[] := coalesce(p_perms, '{}'::text[]);
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_roles') then return public.org_err('You cannot manage roles.'); end if;
  if char_length(n) not between 1 and 24 then return public.org_err('Role names are 1 to 24 characters.'); end if;
  if not (pp <@ public.org_perms()) then return public.org_err('Unknown permission.'); end if;
  if exists (select 1 from unnest(pp) x where not public.org_can(p_org, me, x)) then return public.org_err('You cannot grant permissions you do not have.'); end if;
  if p_id is null then
    if (select count(*) from public.org_roles where org_id = p_org) >= 20 then return public.org_err('An organization can have up to 20 custom roles.'); end if;
    insert into public.org_roles(org_id, name, perms) values (p_org, n, pp);
  else
    update public.org_roles set name = n, perms = pp where id = p_id and org_id = p_org;
    if not found then return public.org_err('Role not found.'); end if;
  end if;
  perform public.org_log(p_org, me, 'role saved', n || ': ' || array_to_string(pp, ','));
  return public.org_ok();
exception when unique_violation then
  return public.org_err('That role name is already used.');
end $f$;

create function public.delete_org_role(p_org uuid, p_id uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_roles') then return public.org_err('You cannot manage roles.'); end if;
  delete from public.org_roles where id = p_id and org_id = p_org;
  if not found then return public.org_err('Role not found.'); end if;
  perform public.org_log(p_org, me, 'role deleted', p_id::text);
  return public.org_ok();
end $f$;

create function public.assign_org_role(p_org uuid, p_user uuid, p_role uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); tr text := public.org_role(p_org, p_user);
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_roles') then return public.org_err('You cannot manage roles.'); end if;
  if tr is null then return public.org_err('Member not found.'); end if;
  if tr = 'owner' or public.org_rank(public.org_role(p_org, me)) <= public.org_rank(tr) then return public.org_err('You cannot change this member.'); end if;
  if p_role is not null then
    if not exists (select 1 from public.org_roles where id = p_role and org_id = p_org) then return public.org_err('Role not found.'); end if;
    if exists (select 1 from public.org_roles r, unnest(r.perms) x where r.id = p_role and not public.org_can(p_org, me, x)) then return public.org_err('You cannot grant permissions you do not have.'); end if;
  end if;
  update public.org_members set custom_role = p_role where org_id = p_org and user_id = p_user;
  perform public.org_log(p_org, me, 'role assigned', p_user::text);
  return public.org_ok();
end $f$;

create function public.list_org_audit(p_org uuid, p_limit integer) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'view_audit') then return public.org_err('You cannot view the audit log.'); end if;
  return public.org_ok(coalesce((select jsonb_agg(x.j order by x.at desc) from (
    select a.created_at as at, jsonb_build_object('id', a.id, 'action', a.action, 'detail', a.detail, 'created_at', a.created_at, 'actor', p.username) as j
    from public.org_audit a left join public.profiles p on p.id = a.actor where a.org_id = p_org order by a.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 200)) x), '[]'::jsonb));
end $f$;

create function public.get_org_policy(p_org uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); pol public.org_policies;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if public.org_role(p_org, me) is null then return public.org_err('Organization not found.'); end if;
  select * into pol from public.org_policies where org_id = p_org;
  return public.org_ok(jsonb_build_object('who_can_invite', pol.who_can_invite, 'invite_approval', pol.invite_approval, 'allowed_domains', to_jsonb(pol.allowed_domains),
    'policy_text', pol.policy_text, 'policy_version', pol.policy_version, 'can_edit', public.org_can(p_org, me, 'edit_policies'),
    'accepted', pol.policy_text is null or pol.policy_version = 0 or exists (select 1 from public.org_policy_accepts where org_id = p_org and user_id = me and version = pol.policy_version)));
end $f$;

create function public.set_org_policy(p_org uuid, p_who text, p_approval boolean, p_domains text[], p_text text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); old public.org_policies; t text := nullif(btrim(coalesce(p_text, '')), ''); dm text[] := coalesce(p_domains, '{}'::text[]); x text;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'edit_policies') then return public.org_err('You cannot edit policies.'); end if;
  if coalesce(p_who, '') not in ('admins','managers','members') then return public.org_err('Invalid invite rule.'); end if;
  if cardinality(dm) > 20 then return public.org_err('Up to 20 domains.'); end if;
  foreach x in array dm loop
    if x !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then return public.org_err('Domains must look like example.com in lowercase.'); end if;
  end loop;
  if t is not null and char_length(t) > 5000 then return public.org_err('The policy text is too long.'); end if;
  select * into old from public.org_policies where org_id = p_org;
  update public.org_policies set who_can_invite = p_who, invite_approval = coalesce(p_approval, false), allowed_domains = dm, policy_text = t,
    policy_version = case when t is distinct from old.policy_text and t is not null then old.policy_version + 1 else old.policy_version end, updated_at = now()
    where org_id = p_org;
  perform public.org_log(p_org, me, 'policy', 'invite=' || p_who || ' approval=' || coalesce(p_approval, false)::text || ' domains=' || cardinality(dm));
  return public.org_ok();
end $f$;

create function public.get_org_policy_stats(p_org uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); v int;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'view_audit') then return public.org_err('You cannot view this.'); end if;
  select policy_version into v from public.org_policies where org_id = p_org;
  return public.org_ok(jsonb_build_object('version', v, 'total', (select count(*) from public.org_members where org_id = p_org),
    'accepted', (select count(*) from public.org_policy_accepts a join public.org_members m on m.org_id = a.org_id and m.user_id = a.user_id where a.org_id = p_org and a.version = v)));
end $f$;

create function public.org_deliver(p_id uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $f$
declare a public.org_announcements; nm text; m record;
begin
  select * into a from public.org_announcements where id = p_id and delivered_at is null;
  if a.id is null then return; end if;
  select name into nm from public.organizations where id = a.org_id;
  for m in select user_id from public.org_members where org_id = a.org_id loop
    perform public.org_notify(m.user_id, nm || ': ' || a.title, left(a.body, 140), '/organizations');
  end loop;
  update public.org_announcements set delivered_at = now() where id = p_id;
end $f$;

create function public.org_deliver_due() returns integer language plpgsql security definer set search_path = public, pg_temp as $f$
declare r record; n int := 0;
begin
  for r in select id from public.org_announcements where delivered_at is null and publish_at <= now() and (expires_at is null or expires_at > now()) loop
    perform public.org_deliver(r.id); n := n + 1;
  end loop;
  return n;
end $f$;

create function public.post_org_announcement(p_org uuid, p_title text, p_body text, p_pinned boolean, p_publish_at timestamptz, p_expires_at timestamptz) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); pa timestamptz := coalesce(p_publish_at, now()); aid uuid;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'post_announcements') then return public.org_err('You cannot post announcements.'); end if;
  if char_length(t) not between 1 and 120 then return public.org_err('Titles are 1 to 120 characters.'); end if;
  if char_length(b) not between 1 and 4000 then return public.org_err('Announcements are 1 to 4000 characters.'); end if;
  if p_expires_at is not null and p_expires_at <= pa then return public.org_err('Expiry must be after the publish time.'); end if;
  insert into public.org_announcements(org_id, author, title, body, pinned, publish_at, expires_at) values (p_org, me, t, b, coalesce(p_pinned, false), pa, p_expires_at) returning id into aid;
  if pa <= now() then perform public.org_deliver(aid); end if;
  perform public.org_log(p_org, me, 'announcement', t);
  return public.org_ok(jsonb_build_object('id', aid));
end $f$;

create function public.list_org_announcements(p_org uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); mg boolean;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if public.org_role(p_org, me) is null then return public.org_err('Organization not found.'); end if;
  mg := public.org_can(p_org, me, 'post_announcements');
  return public.org_ok(coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'pinned', a.pinned, 'publish_at', a.publish_at, 'expires_at', a.expires_at,
    'state', case when a.publish_at > now() then 'scheduled' when a.expires_at is not null and a.expires_at <= now() then 'expired' else 'live' end,
    'read', exists (select 1 from public.org_announcement_reads r where r.announcement_id = a.id and r.user_id = me),
    'reads', case when mg then (select count(*) from public.org_announcement_reads r where r.announcement_id = a.id) end,
    'can_manage', mg) order by a.pinned desc, a.publish_at desc)
    from public.org_announcements a where a.org_id = p_org and (mg or (a.publish_at <= now() and (a.expires_at is null or a.expires_at > now())))), '[]'::jsonb));
end $f$;

create function public.mark_org_announcement_read(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); o uuid;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select org_id into o from public.org_announcements where id = p_id and publish_at <= now();
  if o is null or public.org_role(o, me) is null then return public.org_err('Announcement not found.'); end if;
  insert into public.org_announcement_reads(announcement_id, user_id) values (p_id, me) on conflict do nothing;
  return public.org_ok();
end $f$;

create function public.pin_org_announcement(p_id uuid, p_on boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); o uuid;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select org_id into o from public.org_announcements where id = p_id;
  if o is null or not public.org_can(o, me, 'post_announcements') then return public.org_err('Announcement not found.'); end if;
  update public.org_announcements set pinned = coalesce(p_on, false) where id = p_id;
  return public.org_ok();
end $f$;

create function public.delete_org_announcement(p_id uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); o uuid;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select org_id into o from public.org_announcements where id = p_id;
  if o is null or not public.org_can(o, me, 'post_announcements') then return public.org_err('Announcement not found.'); end if;
  delete from public.org_announcements where id = p_id;
  perform public.org_log(o, me, 'announcement deleted', p_id::text);
  return public.org_ok();
end $f$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace loop
    if r.proname = any(array['list_org_roles','set_org_builtin_perms','save_org_role','delete_org_role','assign_org_role','list_org_audit','get_org_policy','set_org_policy','get_org_policy_stats','post_org_announcement','list_org_announcements','mark_org_announcement_read','pin_org_announcement','delete_org_announcement']) then
      execute 'revoke all on function ' || r.sig || ' from public, anon'; execute 'grant execute on function ' || r.sig || ' to authenticated';
    elsif r.proname = any(array['org_deliver','org_deliver_due']) then
      execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    end if;
  end loop;
  perform cron.schedule('xentra_org_announce', '* * * * *', 'select public.org_deliver_due()');
end $$;
commit;

select jsonb_build_object(
 'client_ok', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(array['list_org_roles','set_org_builtin_perms','save_org_role','delete_org_role','assign_org_role','list_org_audit','get_org_policy','set_org_policy','get_org_policy_stats','post_org_announcement','list_org_announcements','mark_org_announcement_read','pin_org_announcement','delete_org_announcement']) and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')),
 'helpers_open', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(array['org_deliver','org_deliver_due']) and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'))),
 'cron', (select schedule from cron.job where jobname = 'xentra_org_announce'));
