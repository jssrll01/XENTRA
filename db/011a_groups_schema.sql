alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('direct', 'group'));
alter table public.conversations add column if not exists name text;
alter table public.conversations add column if not exists description text;
alter table public.conversations add column if not exists avatar_url text;
alter table public.conversations add column if not exists announcement_only boolean not null default false;
alter table public.conversations add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.conversations add column if not exists invite_code text;
alter table public.conversations add column if not exists invite_enabled boolean not null default true;
create unique index if not exists conv_invite_code on public.conversations(invite_code) where invite_code is not null;
alter table public.conversations drop constraint if exists conv_group_name;
alter table public.conversations add constraint conv_group_name check (kind <> 'group' or char_length(btrim(coalesce(name, ''))) between 1 and 60);
alter table public.conversation_members add column if not exists role text not null default 'member';
alter table public.conversation_members drop constraint if exists cm_role_check;
alter table public.conversation_members add constraint cm_role_check check (role in ('owner', 'admin', 'member'));
create index if not exists cm_user_idx on public.conversation_members(user_id);
create or replace function public.group_role(p_cid uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.conversation_members where conversation_id = p_cid and user_id = p_user
$$;
create or replace function public.is_group(p_cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversations where id = p_cid and kind = 'group')
$$;
create or replace function public.block_between(p_cid uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.conversations where id = p_cid and kind = 'group') then
      exists (select 1 from public.conversations c join public.conversation_members m on m.conversation_id = c.id
              where c.id = p_cid and c.announcement_only and m.user_id = p_user and m.role = 'member')
    else
      (select count(*) from public.conversation_members where conversation_id = p_cid) = 2
      and exists (select 1 from public.conversation_members m where m.conversation_id = p_cid and m.user_id <> p_user and public.pair_blocked(p_user, m.user_id))
  end
$$;
create or replace function public.block_error(p_cid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid;
begin
  if me is null then return null; end if;
  if public.is_group(p_cid) then
    if public.block_between(p_cid, me) then return 'Only admins can send messages in this group.'; end if;
    return null;
  end if;
  if not public.block_between(p_cid, me) then return null; end if;
  select m.user_id into o from public.conversation_members m where m.conversation_id = p_cid and m.user_id <> me limit 1;
  if exists (select 1 from public.blocks where blocker = me and blocked = o) then return 'You blocked this person. Unblock them to send messages.'; end if;
  return 'You cannot send messages to this person.';
end $$;
create or replace function public.list_conversations() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(t.j order by t.pinned desc, t.lm desc), '[]'::jsonb) into r from (
    select cm.pinned, c.last_message_at as lm, jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'pinned', cm.pinned, 'muted', cm.muted, 'archived', cm.archived,
      'last_message_at', c.last_message_at,
      'other', case when c.kind = 'group'
        then jsonb_build_object('id', c.id, 'username', 'group', 'first_name', c.name, 'last_name', '', 'avatar_url', c.avatar_url,
               'is_group', true, 'announcement_only', c.announcement_only, 'my_role', cm.role,
               'members', (select count(*) from public.conversation_members x where x.conversation_id = c.id))
        else jsonb_build_object('id', d.id, 'username', d.username, 'first_name', d.first_name, 'last_name', d.last_name, 'avatar_url', d.avatar_url) end,
      'last', (select jsonb_build_object('id', m.id, 'sender_id', m.sender_id, 'sender_name', public.disp(m.sender_id), 'created_at', m.created_at,
                 'body', case when m.deleted_at is null then m.body else null end, 'deleted', m.deleted_at is not null)
               from public.messages m where m.conversation_id = c.id and m.thread_root is null order by m.created_at desc limit 1),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> me and m.deleted_at is null and m.created_at > cm.last_read_at)
    ) as j
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    left join lateral (select p.id, p.username, p.first_name, p.last_name, p.avatar_url
                       from public.conversation_members o join public.profiles p on p.id = o.user_id
                       where o.conversation_id = c.id and o.user_id <> me and c.kind = 'direct' limit 1) d on true
    where cm.user_id = me and (c.kind = 'group' or (d.id is not null and not exists (select 1 from public.blocks bk where bk.blocker = me and bk.blocked = d.id)))
  ) t;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
revoke all on function public.group_role(uuid, uuid), public.is_group(uuid), public.list_conversations() from public, anon, authenticated;
grant execute on function public.list_conversations() to authenticated;
