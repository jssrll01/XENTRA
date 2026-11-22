create or replace function public.create_team(p_name text, p_description text default null, p_join_mode text default 'open', p_discoverable boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); d text := nullif(btrim(coalesce(p_description, '')), ''); m text := coalesce(p_join_mode, 'open'); t uuid; cid uuid;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if char_length(n) < 1 or char_length(n) > 60 then return public.jerr('Team names are 1 to 60 characters.'); end if;
  if d is not null and char_length(d) > 300 then return public.jerr('The description is too long.'); end if;
  if m not in ('open', 'approval') then return public.jerr('Invalid join mode.'); end if;
  if (select count(*) from public.teams where created_by = me) >= 20 then return public.jerr('You can create up to 20 teams.'); end if;
  insert into public.teams(name, description, join_mode, discoverable, created_by, invite_code)
    values (n, d, m, coalesce(p_discoverable, true), me, substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)) returning id into t;
  insert into public.team_members(team_id, user_id, role) values (t, me, 'owner');
  insert into public.conversations(kind) values ('channel') returning id into cid;
  insert into public.team_channels(conversation_id, team_id, name) values (cid, t, 'general');
  insert into public.conversation_members(conversation_id, user_id) values (cid, me);
  perform public.log_team(t, me, 'created', 'created the team');
  return public.jok(jsonb_build_object('id', t));
end $$;
create or replace function public.update_team(p_id uuid, p_name text default null, p_description text default null, p_join_mode text default null, p_discoverable boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(p_name);
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_id, me)) < 2 then return public.jerr('Only admins can change the team.'); end if;
  if n is not null and (char_length(n) < 1 or char_length(n) > 60) then return public.jerr('Team names are 1 to 60 characters.'); end if;
  if p_description is not null and char_length(btrim(p_description)) > 300 then return public.jerr('The description is too long.'); end if;
  if p_join_mode is not null and p_join_mode not in ('open', 'approval') then return public.jerr('Invalid join mode.'); end if;
  update public.teams set name = coalesce(n, name),
    description = case when p_description is null then description else nullif(btrim(p_description), '') end,
    join_mode = coalesce(p_join_mode, join_mode), discoverable = coalesce(p_discoverable, discoverable) where id = p_id;
  return public.jok();
end $$;
create or replace function public.set_team_avatar(p_id uuid, p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_id, me)) < 2 then return public.jerr('Only admins can change the team.'); end if;
  if u is not null and (char_length(u) > 500 or left(u, 8) <> 'https://') then return public.jerr('Invalid image link.'); end if;
  update public.teams set avatar_url = u where id = p_id;
  return public.jok();
end $$;
create or replace function public.get_team(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.teams; r text; mu boolean;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into t from public.teams where id = p_id;
  select role, muted into r, mu from public.team_members where team_id = p_id and user_id = me;
  if t.id is null or r is null then return public.jerr('Team not found.'); end if;
  return public.jok(jsonb_build_object('id', t.id, 'me', me, 'name', t.name, 'description', t.description, 'avatar_url', t.avatar_url,
    'join_mode', t.join_mode, 'discoverable', t.discoverable, 'created_at', t.created_at, 'my_role', r, 'muted', mu,
    'members', (select count(*) from public.team_members where team_id = p_id),
    'invite_code', case when public.team_rank(r) >= 2 then t.invite_code else null end,
    'invite_enabled', case when public.team_rank(r) >= 2 then t.invite_enabled else null end));
end $$;
create or replace function public.list_my_teams() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description, 'avatar_url', t.avatar_url, 'my_role', m.role,
      'members', (select count(*) from public.team_members x where x.team_id = t.id),
      'channels', (select count(*) from public.team_channels c where c.team_id = t.id and not c.archived)) order by lower(t.name)), '[]'::jsonb) into r
    from public.team_members m join public.teams t on t.id = m.team_id where m.user_id = me;
  return public.jok(r);
end $$;
create or replace function public.discover_teams(p_q text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb; q text := lower(btrim(coalesce(p_q, '')));
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select coalesce(jsonb_agg(x.j order by x.nm), '[]'::jsonb) into r from (
    select lower(t.name) as nm, jsonb_build_object('id', t.id, 'name', t.name, 'description', t.description, 'avatar_url', t.avatar_url, 'join_mode', t.join_mode,
      'members', (select count(*) from public.team_members m where m.team_id = t.id),
      'is_member', exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id = me),
      'requested', exists (select 1 from public.team_join_requests j where j.team_id = t.id and j.user_id = me and j.status = 'pending')) as j
    from public.teams t
    where t.discoverable and not exists (select 1 from public.team_bans b where b.team_id = t.id and b.user_id = me)
      and (q = '' or position(q in lower(t.name)) > 0)
    order by lower(t.name) limit 50) x;
  return public.jok(r);
end $$;
create or replace function public.preview_team(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.teams; mem boolean;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into t from public.teams where invite_enabled and invite_code = lower(btrim(coalesce(p_code, '')));
  if t.id is null or exists (select 1 from public.team_bans where team_id = t.id and user_id = me) then return public.jerr('This invite link is not valid.'); end if;
  mem := exists (select 1 from public.team_members where team_id = t.id and user_id = me);
  return public.jok(jsonb_build_object('name', t.name, 'description', t.description, 'avatar_url', t.avatar_url,
    'members', (select count(*) from public.team_members where team_id = t.id), 'is_member', mem, 'id', case when mem then t.id else null end));
end $$;
create or replace function public.join_team(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.teams;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into t from public.teams where id = p_id;
  if t.id is null or (not t.discoverable and public.team_role(p_id, me) is null) then return public.jerr('Team not found.'); end if;
  if public.team_role(p_id, me) is not null then return public.jok(jsonb_build_object('id', p_id, 'status', 'joined')); end if;
  if exists (select 1 from public.team_bans where team_id = p_id and user_id = me) then return public.jerr('You cannot join this team.'); end if;
  if t.join_mode = 'open' then
    perform public.add_member(p_id, me);
    return public.jok(jsonb_build_object('id', p_id, 'status', 'joined'));
  end if;
  insert into public.team_join_requests(team_id, user_id) values (p_id, me) on conflict (team_id, user_id) where status = 'pending' do nothing;
  if found then
    insert into public.notifications(user_id, type, title, body, link)
      select m.user_id, 'team_request', 'New join request', public.disp(me) || ' wants to join ' || t.name || '.', '/teams/' || p_id::text
      from public.team_members m where m.team_id = p_id and m.role in ('owner', 'admin');
  end if;
  return public.jok(jsonb_build_object('id', p_id, 'status', 'requested'));
end $$;
create or replace function public.join_team_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.teams;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into t from public.teams where invite_enabled and invite_code = lower(btrim(coalesce(p_code, '')));
  if t.id is null or exists (select 1 from public.team_bans where team_id = t.id and user_id = me) then return public.jerr('This invite link is not valid.'); end if;
  perform public.add_member(t.id, me);
  return public.jok(jsonb_build_object('id', t.id));
end $$;
create or replace function public.list_join_requests(p_team uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_team, me)) < 2 then return public.jerr('Only admins can see requests.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'created_at', q.created_at, 'user', jsonb_build_object('id', p.id, 'username', p.username,
      'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url)) order by q.created_at), '[]'::jsonb) into r
    from public.team_join_requests q join public.profiles p on p.id = q.user_id where q.team_id = p_team and q.status = 'pending';
  return public.jok(r);
end $$;
create or replace function public.respond_join_request(p_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.team_join_requests; n text;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into r from public.team_join_requests where id = p_id and status = 'pending' for update;
  if r.id is null then return public.jerr('Request not found.'); end if;
  if public.team_rank(public.team_role(r.team_id, me)) < 2 then return public.jerr('Only admins can respond.'); end if;
  if not coalesce(p_accept, false) or exists (select 1 from public.team_bans where team_id = r.team_id and user_id = r.user_id) then
    update public.team_join_requests set status = 'declined', responded_at = now() where id = p_id;
    return public.jok(jsonb_build_object('status', 'declined'));
  end if;
  perform public.add_member(r.team_id, r.user_id);
  update public.team_join_requests set status = 'accepted', responded_at = now() where id = p_id;
  select name into n from public.teams where id = r.team_id;
  insert into public.notifications(user_id, type, title, body, link) values (r.user_id, 'team_accepted', 'Request accepted', 'You joined ' || n || '.', '/teams/' || r.team_id::text);
  return public.jok(jsonb_build_object('status', 'accepted'));
end $$;
create or replace function public.reset_team_invite(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_id, me)) < 2 then return public.jerr('Only admins can change the invite link.'); end if;
  update public.teams set invite_code = c, invite_enabled = true where id = p_id;
  return public.jok(jsonb_build_object('code', c));
end $$;
create or replace function public.set_team_invite_enabled(p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_id, me)) < 2 then return public.jerr('Only admins can change the invite link.'); end if;
  update public.teams set invite_enabled = coalesce(p_on, false) where id = p_id;
  return public.jok();
end $$;
revoke all on function public.create_team(text, text, text, boolean), public.update_team(uuid, text, text, text, boolean), public.set_team_avatar(uuid, text), public.get_team(uuid),
  public.list_my_teams(), public.discover_teams(text), public.preview_team(text), public.join_team(uuid), public.join_team_by_code(text), public.list_join_requests(uuid),
  public.respond_join_request(uuid, boolean), public.reset_team_invite(uuid), public.set_team_invite_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_team(text, text, text, boolean), public.update_team(uuid, text, text, text, boolean), public.set_team_avatar(uuid, text), public.get_team(uuid),
  public.list_my_teams(), public.discover_teams(text), public.preview_team(text), public.join_team(uuid), public.join_team_by_code(text), public.list_join_requests(uuid),
  public.respond_join_request(uuid, boolean), public.reset_team_invite(uuid), public.set_team_invite_enabled(uuid, boolean) to authenticated;
