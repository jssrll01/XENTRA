create or replace function public.list_team_members(p_team uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_role(p_team, me) is null then return public.jerr('Team not found.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
      'avatar_url', p.avatar_url, 'role', m.role, 'muted', m.muted, 'joined_at', m.joined_at)
    order by public.team_rank(m.role) desc, lower(p.username)), '[]'::jsonb) into r
    from public.team_members m join public.profiles p on p.id = m.user_id where m.team_id = p_team;
  return public.jok(r);
end $$;
create or replace function public.set_team_role(p_team uuid, p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tr text;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_role(p_team, me) is distinct from 'owner' then return public.jerr('Only the owner can change roles.'); end if;
  if coalesce(p_role, '') not in ('admin', 'moderator', 'member') then return public.jerr('Invalid role.'); end if;
  tr := public.team_role(p_team, p_user);
  if tr is null then return public.jerr('Member not found.'); end if;
  if tr = 'owner' or p_user = me then return public.jerr('You cannot change this role.'); end if;
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
  perform public.log_team(p_team, me, 'role', 'made ' || public.disp(p_user) || ' ' || p_role);
  return public.jok();
end $$;
create or replace function public.transfer_team_owner(p_team uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_role(p_team, me) is distinct from 'owner' then return public.jerr('Only the owner can transfer ownership.'); end if;
  if p_user is null or p_user = me or public.team_role(p_team, p_user) is null then return public.jerr('Choose another member.'); end if;
  update public.team_members set role = 'owner' where team_id = p_team and user_id = p_user;
  update public.team_members set role = 'admin' where team_id = p_team and user_id = me;
  perform public.log_team(p_team, me, 'owner', 'made ' || public.disp(p_user) || ' the owner');
  return public.jok();
end $$;
create or replace function public.leave_team(p_team uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r text;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  r := public.team_role(p_team, me);
  if r is null then return public.jerr('Team not found.'); end if;
  if r = 'owner' then return public.jerr('Transfer ownership before leaving.'); end if;
  delete from public.team_members where team_id = p_team and user_id = me;
  perform public.remove_from_channels(p_team, me);
  perform public.log_team(p_team, me, 'left', 'left the team');
  return public.jok();
end $$;
create or replace function public.kick_member(p_team uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mr text; tr text;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  mr := public.team_role(p_team, me); tr := public.team_role(p_team, p_user);
  if public.team_rank(mr) < 1 then return public.jerr('You cannot moderate this team.'); end if;
  if tr is null then return public.jerr('Member not found.'); end if;
  if p_user = me then return public.jerr('Use Leave team instead.'); end if;
  if public.team_rank(mr) <= public.team_rank(tr) then return public.jerr('You cannot remove this member.'); end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  perform public.remove_from_channels(p_team, p_user);
  perform public.log_team(p_team, me, 'kicked', 'removed ' || public.disp(p_user));
  return public.jok();
end $$;
create or replace function public.ban_member(p_team uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mr text; tr text;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  mr := public.team_role(p_team, me); tr := public.team_role(p_team, p_user);
  if public.team_rank(mr) < 1 then return public.jerr('You cannot moderate this team.'); end if;
  if tr is null then return public.jerr('Member not found.'); end if;
  if p_user = me or public.team_rank(mr) <= public.team_rank(tr) then return public.jerr('You cannot ban this member.'); end if;
  insert into public.team_bans(team_id, user_id, banned_by) values (p_team, p_user, me) on conflict do nothing;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  perform public.remove_from_channels(p_team, p_user);
  perform public.log_team(p_team, me, 'banned', 'banned ' || public.disp(p_user));
  return public.jok();
end $$;
create or replace function public.unban_member(p_team uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_team, me)) < 1 then return public.jerr('You cannot moderate this team.'); end if;
  delete from public.team_bans where team_id = p_team and user_id = p_user;
  if not found then return public.jerr('Ban not found.'); end if;
  perform public.log_team(p_team, me, 'unbanned', 'unbanned ' || public.disp(p_user));
  return public.jok();
end $$;
create or replace function public.list_bans(p_team uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_team, me)) < 1 then return public.jerr('You cannot moderate this team.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
      'avatar_url', p.avatar_url, 'banned_at', b.created_at) order by b.created_at desc), '[]'::jsonb) into r
    from public.team_bans b join public.profiles p on p.id = b.user_id where b.team_id = p_team;
  return public.jok(r);
end $$;
create or replace function public.mute_member(p_team uuid, p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mr text; tr text;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  mr := public.team_role(p_team, me); tr := public.team_role(p_team, p_user);
  if public.team_rank(mr) < 1 then return public.jerr('You cannot moderate this team.'); end if;
  if tr is null then return public.jerr('Member not found.'); end if;
  if p_user = me or public.team_rank(mr) <= public.team_rank(tr) then return public.jerr('You cannot mute this member.'); end if;
  update public.team_members set muted = coalesce(p_on, false) where team_id = p_team and user_id = p_user;
  perform public.log_team(p_team, me, 'muted', case when coalesce(p_on, false) then 'muted ' else 'unmuted ' end || public.disp(p_user));
  return public.jok();
end $$;
revoke all on function public.list_team_members(uuid), public.set_team_role(uuid, uuid, text), public.transfer_team_owner(uuid, uuid), public.leave_team(uuid),
  public.kick_member(uuid, uuid), public.ban_member(uuid, uuid), public.unban_member(uuid, uuid), public.list_bans(uuid), public.mute_member(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.list_team_members(uuid), public.set_team_role(uuid, uuid, text), public.transfer_team_owner(uuid, uuid), public.leave_team(uuid),
  public.kick_member(uuid, uuid), public.ban_member(uuid, uuid), public.unban_member(uuid, uuid), public.list_bans(uuid), public.mute_member(uuid, uuid, boolean) to authenticated;
