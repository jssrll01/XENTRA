create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct')),
  direct_key text unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  pinned boolean not null default false,
  muted boolean not null default false,
  archived boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists cm_user_idx on public.conversation_members(user_id);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 4000),
  reply_to uuid references public.messages(id) on delete set null,
  client_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sender_id, client_id)
);
create index if not exists msg_conv_idx on public.messages(conversation_id, created_at desc);
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

create or replace function public.is_member(p_cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.conversation_members where conversation_id = p_cid and user_id = auth.uid())
$$;

drop policy if exists conv_sel on public.conversations;
create policy conv_sel on public.conversations for select to authenticated using (public.is_member(id));
drop policy if exists cm_sel on public.conversation_members;
create policy cm_sel on public.conversation_members for select to authenticated using (public.is_member(conversation_id));
drop policy if exists msg_sel on public.messages;
create policy msg_sel on public.messages for select to authenticated using (public.is_member(conversation_id));
drop policy if exists rx_sel on public.message_reactions;
create policy rx_sel on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));

revoke all on public.conversations, public.conversation_members, public.messages, public.message_reactions from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages, public.message_reactions to authenticated;

create or replace function public.start_direct(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_user is null or p_user = me then return jsonb_build_object('ok', false, 'error', 'Choose another person.'); end if;
  if not exists (select 1 from public.profiles where id = p_user) then return jsonb_build_object('ok', false, 'error', 'Person not found.'); end if;
  k := least(me::text, p_user::text) || ':' || greatest(me::text, p_user::text);
  select id into cid from public.conversations where direct_key = k;
  if cid is null then
    insert into public.conversations(direct_key) values (k) on conflict (direct_key) do nothing returning id into cid;
    if cid is null then select id into cid from public.conversations where direct_key = k; end if;
    insert into public.conversation_members(conversation_id, user_id) values (cid, me), (cid, p_user) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', cid));
end $$;

create or replace function public.list_conversations() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(t.j order by t.pinned desc, t.lm desc), '[]'::jsonb) into r from (
    select cm.pinned, c.last_message_at as lm, jsonb_build_object(
      'id', c.id, 'pinned', cm.pinned, 'muted', cm.muted, 'archived', cm.archived,
      'last_message_at', c.last_message_at,
      'other', jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url),
      'last', (select jsonb_build_object('id', m.id, 'sender_id', m.sender_id, 'created_at', m.created_at,
                 'body', case when m.deleted_at is null then m.body else null end, 'deleted', m.deleted_at is not null)
               from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> me and m.deleted_at is null and m.created_at > cm.last_read_at)
    ) as j
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    join public.conversation_members o on o.conversation_id = c.id and o.user_id <> me
    join public.profiles p on p.id = o.user_id
    where cm.user_id = me
  ) t;
  return jsonb_build_object('ok', true, 'data', r);
end $$;

create or replace function public.list_messages(p_conversation uuid, p_before timestamptz default null, p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  select coalesce(jsonb_agg(t.j order by t.created_at), '[]'::jsonb) into r from (
    select m.created_at, jsonb_build_object(
      'id', m.id, 'conversation_id', m.conversation_id, 'sender_id', m.sender_id,
      'body', case when m.deleted_at is null then m.body else '' end,
      'reply_to', m.reply_to, 'client_id', m.client_id, 'edited_at', m.edited_at,
      'deleted', m.deleted_at is not null, 'created_at', m.created_at,
      'reply', (select jsonb_build_object('id', q.id, 'sender_id', q.sender_id, 'deleted', q.deleted_at is not null,
                  'body', case when q.deleted_at is null then left(q.body, 140) else '' end)
                from public.messages q where q.id = m.reply_to),
      'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', g.emoji, 'count', g.n, 'mine', g.mine))
                  from (select emoji, count(*) as n, bool_or(user_id = me) as mine from public.message_reactions where message_id = m.id group by emoji) g), '[]'::jsonb)
    ) as j
    from public.messages m
    where m.conversation_id = p_conversation and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) t;
  return jsonb_build_object('ok', true, 'data', r);
end $$;

create or replace function public.send_message(p_conversation uuid, p_body text, p_client_id uuid default null, p_reply_to uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); m public.messages;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if b = '' then return jsonb_build_object('ok', false, 'error', 'Message is empty.'); end if;
  if char_length(b) > 4000 then return jsonb_build_object('ok', false, 'error', 'Message is too long.'); end if;
  if p_reply_to is not null and not exists (select 1 from public.messages where id = p_reply_to and conversation_id = p_conversation) then
    return jsonb_build_object('ok', false, 'error', 'Reply target not found.');
  end if;
  if p_client_id is not null then
    select * into m from public.messages where sender_id = me and client_id = p_client_id;
    if found then return jsonb_build_object('ok', true, 'data', to_jsonb(m)); end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body, reply_to, client_id)
    values (p_conversation, me, b, p_reply_to, p_client_id) returning * into m;
  update public.conversations set last_message_at = m.created_at where id = p_conversation;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = me;
  return jsonb_build_object('ok', true, 'data', to_jsonb(m));
end $$;

create or replace function public.edit_message(p_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); m public.messages;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into m from public.messages where id = p_id and sender_id = me;
  if not found then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if m.deleted_at is not null then return jsonb_build_object('ok', false, 'error', 'Message was deleted.'); end if;
  if m.edited_at is not null then return jsonb_build_object('ok', false, 'error', 'A message can be edited once.'); end if;
  if b = '' then return jsonb_build_object('ok', false, 'error', 'Message is empty.'); end if;
  if char_length(b) > 4000 then return jsonb_build_object('ok', false, 'error', 'Message is too long.'); end if;
  update public.messages set body = b, edited_at = now() where id = p_id returning * into m;
  return jsonb_build_object('ok', true, 'data', to_jsonb(m));
end $$;

create or replace function public.delete_message(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.messages set deleted_at = now(), body = '' where id = p_id and sender_id = me and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  delete from public.message_reactions where message_id = p_id;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

create or replace function public.mark_read(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = me;
  if not found then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

create or replace function public.toggle_reaction(p_message uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid; e text := btrim(coalesce(p_emoji, ''));
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if char_length(e) < 1 or char_length(e) > 16 then return jsonb_build_object('ok', false, 'error', 'Invalid reaction.'); end if;
  select conversation_id into cid from public.messages where id = p_message and deleted_at is null;
  if cid is null or not public.is_member(cid) then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  delete from public.message_reactions where message_id = p_message and user_id = me and emoji = e;
  if found then return jsonb_build_object('ok', true, 'data', jsonb_build_object('on', false)); end if;
  insert into public.message_reactions(message_id, user_id, emoji) values (p_message, me, e);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('on', true));
end $$;

create or replace function public.home_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); z jsonb := jsonb_build_object('value', 0, 'series', to_jsonb(array_fill(0, array[7]))); un int; ac int; us jsonb; acs jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select count(*) into un from public.messages m join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = me
    where m.sender_id <> me and m.deleted_at is null and m.created_at > cm.last_read_at;
  select count(*) into ac from public.conversation_members cm join public.conversations c on c.id = cm.conversation_id
    where cm.user_id = me and not cm.archived and c.last_message_at > now() - interval '7 days';
  select to_jsonb(array_agg(coalesce(x.n, 0) order by d.day)) into us
    from (select gs::date as day from generate_series((current_date - 6)::timestamp, current_date::timestamp, interval '1 day') gs) d
    left join (select m.created_at::date as day, count(*) as n from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = me
      where m.sender_id <> me and m.deleted_at is null and m.created_at::date >= current_date - 6 group by 1) x on x.day = d.day;
  select to_jsonb(array_agg(coalesce(x.n, 0) order by d.day)) into acs
    from (select gs::date as day from generate_series((current_date - 6)::timestamp, current_date::timestamp, interval '1 day') gs) d
    left join (select m.created_at::date as day, count(distinct m.conversation_id) as n from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = me
      where m.created_at::date >= current_date - 6 group by 1) x on x.day = d.day;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'unread', jsonb_build_object('value', un, 'series', us),
    'active', jsonb_build_object('value', ac, 'series', acs),
    'invites', z, 'scheduled', z,
    'notifications', (select count(*) from public.notifications where user_id = me and read_at is null)));
end $$;

revoke all on function public.is_member(uuid), public.start_direct(uuid), public.list_conversations(),
  public.list_messages(uuid, timestamptz, int), public.send_message(uuid, text, uuid, uuid),
  public.edit_message(uuid, text), public.delete_message(uuid), public.mark_read(uuid),
  public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.is_member(uuid), public.start_direct(uuid), public.list_conversations(),
  public.list_messages(uuid, timestamptz, int), public.send_message(uuid, text, uuid, uuid),
  public.edit_message(uuid, text), public.delete_message(uuid), public.mark_read(uuid),
  public.toggle_reaction(uuid, text) to authenticated;
