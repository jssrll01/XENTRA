create or replace function public.add_group_members(p_id uuid, p_users uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ids uuid[]; nw uuid[]; n text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or coalesce(public.group_role(p_id, me), '') not in ('owner', 'admin') then return jsonb_build_object('ok', false, 'error', 'Only admins can add members.'); end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into ids from unnest(coalesce(p_users, '{}'::uuid[])) as x where x <> me;
  if cardinality(ids) < 1 then return jsonb_build_object('ok', false, 'error', 'Choose at least one contact.'); end if;
  if exists (select 1 from unnest(ids) as x where not exists (select 1 from public.contacts c where c.owner = me and c.contact = x)) then return jsonb_build_object('ok', false, 'error', 'You can only add your contacts.'); end if;
  if exists (select 1 from unnest(ids) as x where public.pair_blocked(me, x)) then return jsonb_build_object('ok', false, 'error', 'You cannot add one of these people.'); end if;
  nw := array(select x from unnest(ids) as x where not exists (select 1 from public.conversation_members m where m.conversation_id = p_id and m.user_id = x));
  if cardinality(nw) = 0 then return jsonb_build_object('ok', false, 'error', 'They are already in the group.'); end if;
  if (select count(*) from public.conversation_members where conversation_id = p_id) + cardinality(nw) > 200 then return jsonb_build_object('ok', false, 'error', 'Groups can have up to 200 members.'); end if;
  insert into public.conversation_members(conversation_id, user_id, role) select p_id, x, 'member' from unnest(nw) as x;
  select name into n from public.conversations where id = p_id;
  insert into public.notifications(user_id, type, title, body, link)
    select x, 'group_added', 'Added to a group', public.disp(me) || ' added you to ' || n || '.', '/messages/' || p_id::text from unnest(nw) as x;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('added', cardinality(nw)));
end $$;
create or replace function public.remove_group_member(p_id uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mr text; tr text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  mr := public.group_role(p_id, me);
  tr := public.group_role(p_id, p_user);
  if not public.is_group(p_id) or mr is null then return jsonb_build_object('ok', false, 'error', 'Group not found.'); end if;
  if tr is null then return jsonb_build_object('ok', false, 'error', 'Member not found.'); end if;
  if p_user = me then return jsonb_build_object('ok', false, 'error', 'Use Leave group instead.'); end if;
  if not (mr = 'owner' or (mr = 'admin' and tr = 'member')) then return jsonb_build_object('ok', false, 'error', 'You cannot remove this member.'); end if;
  delete from public.conversation_members where conversation_id = p_id and user_id = p_user;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.leave_group(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r text; cnt int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  r := public.group_role(p_id, me);
  if not public.is_group(p_id) or r is null then return jsonb_build_object('ok', false, 'error', 'Group not found.'); end if;
  select count(*) into cnt from public.conversation_members where conversation_id = p_id and user_id <> me;
  if r = 'owner' and cnt > 0 then return jsonb_build_object('ok', false, 'error', 'Transfer ownership before leaving.'); end if;
  delete from public.conversation_members where conversation_id = p_id and user_id = me;
  if cnt = 0 then update public.conversations set invite_enabled = false where id = p_id; end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.set_member_role(p_id uuid, p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tr text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or coalesce(public.group_role(p_id, me), '') <> 'owner' then return jsonb_build_object('ok', false, 'error', 'Only the owner can change roles.'); end if;
  if coalesce(p_role, '') not in ('admin', 'member') then return jsonb_build_object('ok', false, 'error', 'Invalid role.'); end if;
  tr := public.group_role(p_id, p_user);
  if tr is null then return jsonb_build_object('ok', false, 'error', 'Member not found.'); end if;
  if tr = 'owner' or p_user = me then return jsonb_build_object('ok', false, 'error', 'You cannot change this role.'); end if;
  update public.conversation_members set role = p_role where conversation_id = p_id and user_id = p_user;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.transfer_ownership(p_id uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or coalesce(public.group_role(p_id, me), '') <> 'owner' then return jsonb_build_object('ok', false, 'error', 'Only the owner can transfer ownership.'); end if;
  if p_user is null or p_user = me or public.group_role(p_id, p_user) is null then return jsonb_build_object('ok', false, 'error', 'Choose another member.'); end if;
  update public.conversation_members set role = 'owner' where conversation_id = p_id and user_id = p_user;
  update public.conversation_members set role = 'admin' where conversation_id = p_id and user_id = me;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
revoke all on function public.add_group_members(uuid, uuid[]), public.remove_group_member(uuid, uuid), public.leave_group(uuid),
  public.set_member_role(uuid, uuid, text), public.transfer_ownership(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_group_members(uuid, uuid[]), public.remove_group_member(uuid, uuid), public.leave_group(uuid),
  public.set_member_role(uuid, uuid, text), public.transfer_ownership(uuid, uuid) to authenticated;
