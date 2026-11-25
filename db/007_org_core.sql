begin;
do $$ begin
  if to_regclass('public.organizations') is not null then raise exception 'organizations exists, nothing applied'; end if;
  if to_regclass('public.notifications') is null then raise exception 'notifications missing'; end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~* 'type') then
    raise exception 'notifications.type is constrained, scan it first';
  end if;
end $$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique,
  description text check (description is null or char_length(description) <= 300),
  logo_url text,
  created_by uuid not null references auth.users(id),
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 12),
  invite_enabled boolean not null default true,
  created_at timestamptz not null default now());
create table public.org_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  perms text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, name));
create table public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','manager','member')),
  custom_role uuid references public.org_roles(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id));
create index org_members_user_idx on public.org_members (user_id);
create table public.org_builtin_perms (
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('admin','manager','member')),
  perms text[] not null,
  primary key (org_id, role));
create table public.org_policies (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  who_can_invite text not null default 'admins' check (who_can_invite in ('admins','managers','members')),
  invite_approval boolean not null default false,
  allowed_domains text[] not null default '{}',
  policy_text text check (policy_text is null or char_length(policy_text) <= 5000),
  policy_version int not null default 0,
  updated_at timestamptz not null default now());
create table public.org_policy_accepts (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version int not null,
  accepted_at timestamptz not null default now(),
  primary key (org_id, user_id, version));
create table public.org_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid,
  action text not null,
  detail text,
  created_at timestamptz not null default now());
create index org_audit_idx on public.org_audit (org_id, created_at desc);
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('user','email')),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now());
create table public.org_join_requests (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id));
create table public.org_announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  pinned boolean not null default false,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now());
create table public.org_announcement_reads (
  announcement_id uuid not null references public.org_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id));

do $$ declare t text; begin
  foreach t in array array['organizations','org_roles','org_members','org_builtin_perms','org_policies','org_policy_accepts','org_audit','org_invites','org_join_requests','org_announcements','org_announcement_reads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

create function public.org_err(m text) returns jsonb language sql immutable as $f$ select jsonb_build_object('ok', false, 'error', m) $f$;
create function public.org_ok(d jsonb default '{}'::jsonb) returns jsonb language sql immutable as $f$ select jsonb_build_object('ok', true, 'data', d) $f$;
create function public.org_perms() returns text[] language sql immutable as $f$ select array['manage_members','manage_roles','post_announcements','edit_policies','view_audit','manage_invitations','manage_sso'] $f$;
create function public.org_rank(r text) returns int language sql immutable as $f$ select case r when 'owner' then 3 when 'admin' then 2 when 'manager' then 1 when 'member' then 0 else -1 end $f$;
create function public.org_default_perms(r text) returns text[] language sql immutable as $f$
  select case r when 'admin' then array['manage_members','manage_roles','post_announcements','edit_policies','view_audit','manage_invitations']
    when 'manager' then array['manage_members','manage_invitations','post_announcements'] else '{}'::text[] end $f$;
create function public.org_role(p_org uuid, p_user uuid) returns text language sql stable security definer set search_path = public, pg_temp as $f$
  select role from public.org_members where org_id = p_org and user_id = p_user $f$;
create function public.org_email(p_user uuid) returns text language sql stable security definer set search_path = public, pg_temp as $f$
  select lower(email) from auth.users where id = p_user $f$;
create function public.org_can(p_org uuid, p_user uuid, p_perm text) returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare r text; cu uuid; bp text[]; def text[]; cp text[];
begin
  select m.role, m.custom_role into r, cu from public.org_members m where m.org_id = p_org and m.user_id = p_user;
  if r is null then return false; end if;
  if r = 'owner' then return true; end if;
  select b.perms into bp from public.org_builtin_perms b where b.org_id = p_org and b.role = r;
  def := coalesce(bp, public.org_default_perms(r));
  if p_perm = any(def) then return true; end if;
  if cu is not null then
    select o.perms into cp from public.org_roles o where o.id = cu and o.org_id = p_org;
    if p_perm = any(coalesce(cp, '{}'::text[])) then return true; end if;
  end if;
  return false;
end $f$;
create function public.org_log(p_org uuid, p_actor uuid, p_action text, p_detail text) returns void language sql security definer set search_path = public, pg_temp as $f$
  insert into public.org_audit(org_id, actor, action, detail) values (p_org, p_actor, p_action, p_detail) $f$;
create function public.org_notify(p_user uuid, p_title text, p_body text, p_link text) returns void language sql security definer set search_path = public, pg_temp as $f$
  insert into public.notifications(user_id, type, title, body, link) values (p_user, 'org', p_title, p_body, p_link) $f$;

create function public.create_org(p_name text, p_description text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); d text := nullif(btrim(coalesce(p_description, '')), ''); s text; oid uuid;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if char_length(n) not between 2 and 60 then return public.org_err('Names are 2 to 60 characters.'); end if;
  if d is not null and char_length(d) > 300 then return public.org_err('The description is too long.'); end if;
  s := trim(both '-' from lower(regexp_replace(n, '[^A-Za-z0-9]+', '-', 'g')));
  if s = '' then s := 'org'; end if;
  s := left(s, 40) || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
  insert into public.organizations(name, slug, description, created_by) values (n, s, d, me) returning id into oid;
  insert into public.org_members(org_id, user_id, role) values (oid, me, 'owner');
  insert into public.org_policies(org_id) values (oid);
  perform public.org_log(oid, me, 'created', n);
  return public.org_ok(jsonb_build_object('id', oid, 'slug', s));
end $f$;

create function public.list_my_orgs() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid();
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  return public.org_ok(coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'logo_url', o.logo_url, 'role', m.role,
    'members', (select count(*) from public.org_members x where x.org_id = o.id)) order by lower(o.name))
    from public.org_members m join public.organizations o on o.id = m.org_id where m.user_id = me), '[]'::jsonb));
end $f$;

create function public.get_org(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); o public.organizations; r text; inv boolean;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  select * into o from public.organizations where id = p_id;
  r := public.org_role(p_id, me);
  if o.id is null or r is null then return public.org_err('Organization not found.'); end if;
  inv := public.org_can(p_id, me, 'manage_invitations');
  return public.org_ok(jsonb_build_object('id', o.id, 'me', me, 'name', o.name, 'slug', o.slug, 'description', o.description, 'logo_url', o.logo_url,
    'created_at', o.created_at, 'my_role', r, 'members', (select count(*) from public.org_members where org_id = p_id),
    'perms', (select jsonb_object_agg(x, public.org_can(p_id, me, x)) from unnest(public.org_perms()) x),
    'invite_code', case when inv then o.invite_code end, 'invite_enabled', case when inv then o.invite_enabled end));
end $f$;

create function public.update_org(p_id uuid, p_name text, p_description text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); d text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if public.org_rank(public.org_role(p_id, me)) < 2 then return public.org_err('Only admins can edit the organization.'); end if;
  if char_length(n) not between 2 and 60 then return public.org_err('Names are 2 to 60 characters.'); end if;
  if d is not null and char_length(d) > 300 then return public.org_err('The description is too long.'); end if;
  update public.organizations set name = n, description = d where id = p_id;
  perform public.org_log(p_id, me, 'updated', 'details');
  return public.org_ok();
end $f$;

create function public.set_org_logo(p_id uuid, p_url text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); u text := nullif(btrim(coalesce(p_url, '')), ''); c text := public.cfg('cloudinary_cloud') #>> '{}';
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if public.org_rank(public.org_role(p_id, me)) < 2 then return public.org_err('Only admins can change the logo.'); end if;
  if u is not null then
    if c is null then return public.org_err('Settings are unavailable.'); end if;
    if char_length(u) > 500 or left(u, char_length('https://res.cloudinary.com/' || c || '/')) <> 'https://res.cloudinary.com/' || c || '/' then return public.org_err('Invalid image link.'); end if;
  end if;
  update public.organizations set logo_url = u where id = p_id;
  perform public.org_log(p_id, me, 'updated', 'logo');
  return public.org_ok();
end $f$;

create function public.list_org_members(p_org uuid, p_q text, p_role text) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); q text := lower(btrim(coalesce(p_q, ''))); rl text := nullif(btrim(coalesce(p_role, '')), '');
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if public.org_role(p_org, me) is null then return public.org_err('Organization not found.'); end if;
  return public.org_ok(coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
    'role', m.role, 'custom_role', r.name, 'joined_at', m.joined_at) order by public.org_rank(m.role) desc, lower(p.username))
    from public.org_members m join public.profiles p on p.id = m.user_id left join public.org_roles r on r.id = m.custom_role
    where m.org_id = p_org
      and (q = '' or position(q in lower(p.username || ' ' || coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))) > 0)
      and (rl is null or m.role = rl or r.id::text = rl)), '[]'::jsonb));
end $f$;

create function public.remove_org_member(p_org uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); tr text := public.org_role(p_org, p_user); nm text;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_members') then return public.org_err('You cannot remove members.'); end if;
  if tr is null then return public.org_err('Member not found.'); end if;
  if p_user = me then return public.org_err('Use Leave organization instead.'); end if;
  if public.org_rank(public.org_role(p_org, me)) <= public.org_rank(tr) then return public.org_err('You cannot remove this member.'); end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
  select name into nm from public.organizations where id = p_org;
  perform public.org_log(p_org, me, 'removed', p_user::text);
  perform public.org_notify(p_user, 'Removed from organization', 'You were removed from ' || nm || '.', '/organizations');
  return public.org_ok();
end $f$;

create function public.leave_org(p_org uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); r text := public.org_role(p_org, me);
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if r is null then return public.org_err('Organization not found.'); end if;
  if r = 'owner' then return public.org_err('Transfer ownership before leaving.'); end if;
  delete from public.org_members where org_id = p_org and user_id = me;
  perform public.org_log(p_org, me, 'left', me::text);
  return public.org_ok();
end $f$;

create function public.transfer_org(p_org uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); nm text;
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if public.org_role(p_org, me) is distinct from 'owner' then return public.org_err('Only the owner can transfer ownership.'); end if;
  if p_user = me or public.org_role(p_org, p_user) is null then return public.org_err('Choose another member.'); end if;
  update public.org_members set role = 'owner', custom_role = null where org_id = p_org and user_id = p_user;
  update public.org_members set role = 'admin' where org_id = p_org and user_id = me;
  select name into nm from public.organizations where id = p_org;
  perform public.org_log(p_org, me, 'transferred', p_user::text);
  perform public.org_notify(p_user, 'You are now the owner', 'You now own ' || nm || '.', '/organizations');
  return public.org_ok();
end $f$;

create function public.set_org_member_role(p_org uuid, p_user uuid, p_role text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $f$
declare me uuid := auth.uid(); mr text := public.org_role(p_org, me); tr text := public.org_role(p_org, p_user);
begin
  if me is null then return public.org_err('Not signed in.'); end if;
  if not public.org_can(p_org, me, 'manage_roles') then return public.org_err('You cannot change roles.'); end if;
  if coalesce(p_role, '') not in ('admin','manager','member') then return public.org_err('Invalid role.'); end if;
  if tr is null then return public.org_err('Member not found.'); end if;
  if p_user = me or public.org_rank(mr) <= public.org_rank(tr) or public.org_rank(p_role) >= public.org_rank(mr) then return public.org_err('You cannot set this role.'); end if;
  update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
  perform public.org_log(p_org, me, 'role', p_user::text || ' ' || p_role);
  return public.org_ok();
end $f$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace loop
    if r.proname = any(array['create_org','list_my_orgs','get_org','update_org','set_org_logo','list_org_members','remove_org_member','leave_org','transfer_org','set_org_member_role']) then
      execute 'revoke all on function ' || r.sig || ' from public, anon'; execute 'grant execute on function ' || r.sig || ' to authenticated';
    elsif r.proname = any(array['org_err','org_ok','org_perms','org_rank','org_default_perms','org_role','org_email','org_can','org_log','org_notify']) then
      execute 'revoke all on function ' || r.sig || ' from public, anon, authenticated';
    end if;
  end loop;
end $$;
commit;

select jsonb_build_object(
 'tables_rls', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname ~ '^(organizations|org_)' and relkind = 'r' and relrowsecurity),
 'tbl_select_auth', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname ~ '^(organizations|org_)' and relkind = 'r' and has_table_privilege('authenticated', oid, 'select')),
 'client_ok', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(array['create_org','list_my_orgs','get_org','update_org','set_org_logo','list_org_members','remove_org_member','leave_org','transfer_org','set_org_member_role']) and has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')),
 'helpers_open', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = any(array['org_err','org_ok','org_perms','org_rank','org_default_perms','org_role','org_email','org_can','org_log','org_notify']) and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'))));
