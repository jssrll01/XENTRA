create or replace function public.create_group(p_name text, p_members uuid[], p_description text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); d text := nullif(btrim(coalesce(p_description, '')), ''); ids uuid[]; cid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if char_length(n) < 1 or char_length(n) > 60 then return jsonb_build_object('ok', false, 'error', 'Group names are 1 to 60 characters.'); end if;
  if d is not null and char_length(d) > 300 then return jsonb_build_object('ok', false, 'error', 'The description is too long.'); end if;
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into ids from unnest(coalesce(p_members, '{}'::uuid[])) as x where x <> me;
  if cardinality(ids) < 1 then return jsonb_build_object('ok', false, 'error', 'Choose at least one contact.'); end if;
  if cardinality(ids) > 199 then return jsonb_build_object('ok', false, 'error', 'Groups can have up to 200 members.'); end if;
  if exists (select 1 from unnest(ids) as x where not exists (select 1 from public.contacts c where c.owner = me and c.contact = x)) then return jsonb_build_object('ok', false, 'error', 'You can only add your contacts.'); end if;
  if exists (select 1 from unnest(ids) as x where public.pair_blocked(me, x)) then return jsonb_build_object('ok', false, 'error', 'You cannot add one of these people.'); end if;
  insert into public.conversations(kind, name, description, created_by, invite_code)
    values ('group', n, d, me, substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)) returning id into cid;
  insert into public.conversation_members(conversation_id, user_id, role) values (cid, me, 'owner');
  insert into public.conversation_members(conversation_id, user_id, role) select cid, x, 'member' from unnest(ids) as x;
  insert into public.notifications(user_id, type, title, body, link)
    select x, 'group_added', 'Added to a group', public.disp(me) || ' added you to ' || n || '.', '/messages/' || cid::text from unnest(ids) as x;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', cid));
end $$;
create or replace function public.update_group(p_id uuid, p_name text default null, p_description text default null, p_announcement boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(p_name);
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or coalesce(public.group_role(p_id, me), '') not in ('owner', 'admin') then return jsonb_build_object('ok', false, 'error', 'Only admins can change the group.'); end if;
  if n is not null and (char_length(n) < 1 or char_length(n) > 60) then return jsonb_build_object('ok', false, 'error', 'Group names are 1 to 60 characters.'); end if;
  if p_description is not null and char_length(btrim(p_description)) > 300 then return jsonb_build_object('ok', false, 'error', 'The description is too long.'); end if;
  update public.conversations set name = coalesce(n, name),
    description = case when p_description is null then description else nullif(btrim(p_description), '') end,
    announcement_only = coalesce(p_announcement, announcement_only) where id = p_id;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.set_group_avatar(p_id uuid, p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or coalesce(public.group_role(p_id, me), '') not in ('owner', 'admin') then return jsonb_build_object('ok', false, 'error', 'Only admins can change the group.'); end if;
  if u is not null and (char_length(u) > 500 or left(u, 8) <> 'https://') then return jsonb_build_object('ok', false, 'error', 'Invalid image link.'); end if;
  update public.conversations set avatar_url = u where id = p_id;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.get_group(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.conversations; r text; cnt int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into g from public.conversations where id = p_id and kind = 'group';
  if not found then return jsonb_build_object('ok', false, 'error', 'Group not found.'); end if;
  r := public.group_role(p_id, me);
  if r is null then return jsonb_build_object('ok', false, 'error', 'Group not found.'); end if;
  select count(*) into cnt from public.conversation_members where conversation_id = p_id;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', g.id, 'me', me, 'name', g.name, 'description', g.description,
    'avatar_url', g.avatar_url, 'announcement_only', g.announcement_only, 'created_at', g.created_at, 'my_role', r, 'members', cnt,
    'invite_code', case when r in ('owner', 'admin') then g.invite_code else null end,
    'invite_enabled', case when r in ('owner', 'admin') then g.invite_enabled else null end));
end $$;
create or replace function public.list_group_members(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or public.group_role(p_id, me) is null then return jsonb_build_object('ok', false, 'error', 'Group not found.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name,
      'avatar_url', p.avatar_url, 'role', m.role, 'joined_at', m.joined_at)
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(p.username)), '[]'::jsonb) into r
    from public.conversation_members m join public.profiles p on p.id = m.user_id where m.conversation_id = p_id;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
create or replace function public.preview_group(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.conversations; cnt int; mem boolean;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into g from public.conversations where kind = 'group' and invite_enabled and invite_code = lower(btrim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('ok', false, 'error', 'This invite link is not valid.'); end if;
  select count(*) into cnt from public.conversation_members where conversation_id = g.id;
  mem := exists (select 1 from public.conversation_members where conversation_id = g.id and user_id = me);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('name', g.name, 'description', g.description, 'avatar_url', g.avatar_url,
    'members', cnt, 'is_member', mem, 'id', case when mem then g.id else null end));
end $$;
create or replace function public.join_group(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.conversations; cnt int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into g from public.conversations where kind = 'group' and invite_enabled and invite_code = lower(btrim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('ok', false, 'error', 'This invite link is not valid.'); end if;
  if exists (select 1 from public.conversation_members where conversation_id = g.id and user_id = me) then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', g.id));
  end if;
  select count(*) into cnt from public.conversation_members where conversation_id = g.id;
  if cnt >= 200 then return jsonb_build_object('ok', false, 'error', 'This group is full.'); end if;
  insert into public.conversation_members(conversation_id, user_id, role) values (g.id, me, 'member') on conflict do nothing;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', g.id));
end $$;
create or replace function public.reset_group_invite(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or coalesce(public.group_role(p_id, me), '') not in ('owner', 'admin') then return jsonb_build_object('ok', false, 'error', 'Only admins can change the invite link.'); end if;
  update public.conversations set invite_code = c, invite_enabled = true where id = p_id;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('code', c));
end $$;
create or replace function public.set_group_invite_enabled(p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_group(p_id) or coalesce(public.group_role(p_id, me), '') not in ('owner', 'admin') then return jsonb_build_object('ok', false, 'error', 'Only admins can change the invite link.'); end if;
  update public.conversations set invite_enabled = coalesce(p_on, false) where id = p_id;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
revoke all on function public.create_group(text, uuid[], text), public.update_group(uuid, text, text, boolean), public.set_group_avatar(uuid, text), public.get_group(uuid),
  public.list_group_members(uuid), public.preview_group(text), public.join_group(text), public.reset_group_invite(uuid), public.set_group_invite_enabled(uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_group(text, uuid[], text), public.update_group(uuid, text, text, boolean), public.set_group_avatar(uuid, text), public.get_group(uuid),
  public.list_group_members(uuid), public.preview_group(text), public.join_group(text), public.reset_group_invite(uuid), public.set_group_invite_enabled(uuid, boolean) to authenticated;
