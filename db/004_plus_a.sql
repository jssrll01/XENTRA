alter table public.messages add column if not exists forwarded boolean not null default false;
create table if not exists public.message_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);
alter table public.message_pins enable row level security;
revoke all on public.message_pins from anon, authenticated;

create or replace function public.set_conversation_flags(p_conversation uuid, p_pinned boolean default null, p_muted boolean default null, p_archived boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_pinned is true and not exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = me and pinned)
     and (select count(*) from public.conversation_members where user_id = me and pinned) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'You can pin up to 5 chats.');
  end if;
  update public.conversation_members set pinned = coalesce(p_pinned, pinned), muted = coalesce(p_muted, muted), archived = coalesce(p_archived, archived)
    where conversation_id = p_conversation and user_id = me;
  if not found then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

create or replace function public.toggle_pin_message(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select conversation_id into cid from public.messages where id = p_message and deleted_at is null;
  if cid is null or not public.is_member(cid) then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  delete from public.message_pins where conversation_id = cid and message_id = p_message;
  if found then return jsonb_build_object('ok', true, 'data', jsonb_build_object('on', false)); end if;
  if (select count(*) from public.message_pins where conversation_id = cid) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Unpin a message first. The limit is 10.');
  end if;
  insert into public.message_pins(conversation_id, message_id, pinned_by) values (cid, p_message, me);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('on', true));
end $$;

create or replace function public.list_pins(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender_id', m.sender_id, 'body', left(m.body, 140), 'created_at', m.created_at) order by p.created_at desc), '[]'::jsonb) into r
    from public.message_pins p join public.messages m on m.id = p.message_id
    where p.conversation_id = p_conversation and m.deleted_at is null;
  return jsonb_build_object('ok', true, 'data', r);
end $$;

create or replace function public.forward_message(p_message uuid, p_conversation uuid, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); src public.messages; m public.messages;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into src from public.messages where id = p_message and deleted_at is null;
  if not found or not public.is_member(src.conversation_id) then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if p_client_id is not null then
    select * into m from public.messages where sender_id = me and client_id = p_client_id;
    if found then return jsonb_build_object('ok', true, 'data', to_jsonb(m)); end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body, client_id, forwarded)
    values (p_conversation, me, src.body, p_client_id, true) returning * into m;
  update public.conversations set last_message_at = m.created_at where id = p_conversation;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = me;
  return jsonb_build_object('ok', true, 'data', to_jsonb(m));
end $$;

create or replace function public.search_messages(p_conversation uuid, p_q text, p_limit int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := btrim(coalesce(p_q, '')); r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if char_length(q) < 2 then return jsonb_build_object('ok', true, 'data', '[]'::jsonb); end if;
  select coalesce(jsonb_agg(t.j order by t.created_at desc), '[]'::jsonb) into r from (
    select m.created_at, jsonb_build_object('id', m.id, 'sender_id', m.sender_id, 'body', left(m.body, 200), 'created_at', m.created_at) as j
    from public.messages m
    where m.conversation_id = p_conversation and m.deleted_at is null
      and m.body ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by m.created_at desc limit least(greatest(coalesce(p_limit, 30), 1), 50)) t;
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
      'deleted', m.deleted_at is not null, 'created_at', m.created_at, 'forwarded', m.forwarded,
      'pinned', exists (select 1 from public.message_pins p where p.message_id = m.id),
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

revoke all on function public.set_conversation_flags(uuid, boolean, boolean, boolean), public.toggle_pin_message(uuid), public.list_pins(uuid),
  public.forward_message(uuid, uuid, uuid), public.search_messages(uuid, text, int), public.list_messages(uuid, timestamptz, int) from public, anon, authenticated;
grant execute on function public.set_conversation_flags(uuid, boolean, boolean, boolean), public.toggle_pin_message(uuid), public.list_pins(uuid),
  public.forward_message(uuid, uuid, uuid), public.search_messages(uuid, text, int), public.list_messages(uuid, timestamptz, int) to authenticated;
