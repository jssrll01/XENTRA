create or replace function public.start_direct(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_user is null or p_user = me then return jsonb_build_object('ok', false, 'error', 'Choose another person.'); end if;
  if not exists (select 1 from public.profiles where id = p_user) then return jsonb_build_object('ok', false, 'error', 'Person not found.'); end if;
  if public.pair_blocked(me, p_user) then
    return jsonb_build_object('ok', false, 'error', case when exists (select 1 from public.blocks where blocker = me and blocked = p_user) then 'You blocked this person. Unblock them to message.' else 'You cannot message this person.' end);
  end if;
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
               from public.messages m where m.conversation_id = c.id and m.thread_root is null order by m.created_at desc limit 1),
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> me and m.deleted_at is null and m.created_at > cm.last_read_at)
    ) as j
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    join public.conversation_members o on o.conversation_id = c.id and o.user_id <> me
    join public.profiles p on p.id = o.user_id
    where cm.user_id = me and not exists (select 1 from public.blocks bk where bk.blocker = me and bk.blocked = p.id)
  ) t;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
create or replace function public.send_message(p_conversation uuid, p_body text, p_client_id uuid default null, p_reply_to uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); m public.messages;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if public.block_error(p_conversation) is not null then return jsonb_build_object('ok', false, 'error', public.block_error(p_conversation)); end if;
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
create or replace function public.forward_message(p_message uuid, p_conversation uuid, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); src public.messages; m public.messages;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into src from public.messages where id = p_message and deleted_at is null;
  if not found or not public.is_member(src.conversation_id) then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if public.block_error(p_conversation) is not null then return jsonb_build_object('ok', false, 'error', public.block_error(p_conversation)); end if;
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
revoke all on function public.start_direct(uuid), public.list_conversations(), public.send_message(uuid, text, uuid, uuid), public.forward_message(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_direct(uuid), public.list_conversations(), public.send_message(uuid, text, uuid, uuid), public.forward_message(uuid, uuid, uuid) to authenticated;
