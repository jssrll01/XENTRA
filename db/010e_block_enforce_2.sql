create or replace function public.create_poll(p_conversation uuid, p_question text, p_options text[], p_multiple boolean default false, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); q text := btrim(coalesce(p_question, '')); opts text[]; m public.messages; pid uuid; i int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if public.block_error(p_conversation) is not null then return jsonb_build_object('ok', false, 'error', public.block_error(p_conversation)); end if;
  select coalesce(array_agg(btrim(t.o) order by t.n) filter (where btrim(t.o) <> ''), '{}') into opts
    from unnest(coalesce(p_options, '{}'::text[])) with ordinality as t(o, n);
  if char_length(q) < 1 or char_length(q) > 200 then return jsonb_build_object('ok', false, 'error', 'Question must be 1 to 200 characters.'); end if;
  if cardinality(opts) < 2 or cardinality(opts) > 10 then return jsonb_build_object('ok', false, 'error', 'A poll needs 2 to 10 options.'); end if;
  if exists (select 1 from unnest(opts) o where char_length(o) > 100) then return jsonb_build_object('ok', false, 'error', 'Options can be up to 100 characters.'); end if;
  if p_client_id is not null then
    select * into m from public.messages where sender_id = me and client_id = p_client_id;
    if found then return jsonb_build_object('ok', true, 'data', to_jsonb(m)); end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body, client_id) values (p_conversation, me, q, p_client_id) returning * into m;
  insert into public.polls(message_id, conversation_id, question, multiple, created_by) values (m.id, p_conversation, q, coalesce(p_multiple, false), me) returning id into pid;
  for i in 1..cardinality(opts) loop
    insert into public.poll_options(poll_id, label, pos) values (pid, opts[i], i);
  end loop;
  update public.conversations set last_message_at = m.created_at where id = p_conversation;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = me;
  return jsonb_build_object('ok', true, 'data', to_jsonb(m));
end $$;
create or replace function public.send_thread_reply(p_root uuid, p_body text, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.messages; m public.messages; b text := btrim(coalesce(p_body, ''));
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into r from public.messages where id = p_root and deleted_at is null and thread_root is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if not public.is_member(r.conversation_id) then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if public.block_error(r.conversation_id) is not null then return jsonb_build_object('ok', false, 'error', public.block_error(r.conversation_id)); end if;
  if char_length(b) < 1 or char_length(b) > 4000 then return jsonb_build_object('ok', false, 'error', 'Reply must be 1 to 4000 characters.'); end if;
  if p_client_id is not null then
    select * into m from public.messages where sender_id = me and client_id = p_client_id;
    if found then return jsonb_build_object('ok', true, 'data', to_jsonb(m)); end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body, client_id, thread_root) values (r.conversation_id, me, b, p_client_id, p_root) returning * into m;
  update public.conversation_members set last_read_at = now() where conversation_id = r.conversation_id and user_id = me;
  return jsonb_build_object('ok', true, 'data', to_jsonb(m));
end $$;
create or replace function public.send_attachment(p_conversation uuid, p_path text, p_name text, p_mime text, p_size bigint, p_caption text default null, p_client_id uuid default null, p_thread_root uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.messages; nm text := btrim(coalesce(p_name, '')); cap text := btrim(coalesce(p_caption, ''));
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if public.block_error(p_conversation) is not null then return jsonb_build_object('ok', false, 'error', public.block_error(p_conversation)); end if;
  if left(coalesce(p_path, ''), 37) <> p_conversation::text || '/' then return jsonb_build_object('ok', false, 'error', 'Invalid file path.'); end if;
  if char_length(nm) < 1 or char_length(nm) > 200 then return jsonb_build_object('ok', false, 'error', 'Invalid file name.'); end if;
  if coalesce(p_size, 0) < 1 or p_size > 26214400 then return jsonb_build_object('ok', false, 'error', 'Files can be up to 25 MB.'); end if;
  if char_length(cap) > 1000 then return jsonb_build_object('ok', false, 'error', 'Caption is too long.'); end if;
  if p_thread_root is not null and not exists (select 1 from public.messages where id = p_thread_root and conversation_id = p_conversation and thread_root is null) then
    return jsonb_build_object('ok', false, 'error', 'Thread not found.');
  end if;
  if p_client_id is not null then
    select * into m from public.messages where sender_id = me and client_id = p_client_id;
    if found then return jsonb_build_object('ok', true, 'data', to_jsonb(m)); end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body, client_id, thread_root) values (p_conversation, me, coalesce(nullif(cap, ''), nm), p_client_id, p_thread_root) returning * into m;
  insert into public.message_attachments(message_id, path, name, mime, size) values (m.id, p_path, nm, left(coalesce(nullif(p_mime, ''), 'application/octet-stream'), 100), p_size);
  if p_thread_root is null then update public.conversations set last_message_at = m.created_at where id = p_conversation; end if;
  update public.conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = me;
  return jsonb_build_object('ok', true, 'data', to_jsonb(m));
end $$;
create or replace function public.dispatch_due() returns void
language plpgsql security definer set search_path = public as $$
declare s record; r record; m public.messages;
begin
  for s in select * from public.scheduled_messages where sent_at is null and cancelled_at is null and send_at <= now() order by send_at limit 100 for update skip locked loop
    if exists (select 1 from public.conversation_members where conversation_id = s.conversation_id and user_id = s.sender_id) and not public.block_between(s.conversation_id, s.sender_id) then
      insert into public.messages(conversation_id, sender_id, body, client_id) values (s.conversation_id, s.sender_id, s.body, s.id) returning * into m;
      update public.conversations set last_message_at = m.created_at where id = s.conversation_id;
      update public.conversation_members set last_read_at = m.created_at where conversation_id = s.conversation_id and user_id = s.sender_id;
    end if;
    update public.scheduled_messages set sent_at = now() where id = s.id;
  end loop;
  for r in select * from public.reminders where fired_at is null and cancelled_at is null and remind_at <= now() order by remind_at limit 100 for update skip locked loop
    insert into public.notifications(user_id, type, title, body, link)
      values (r.user_id, 'reminder', 'Reminder', r.note, case when r.conversation_id is not null then '/messages/' || r.conversation_id::text else null end);
    update public.reminders set fired_at = now() where id = r.id;
  end loop;
end $$;
revoke all on function public.create_poll(uuid, text, text[], boolean, uuid), public.send_thread_reply(uuid, text, uuid),
  public.send_attachment(uuid, text, text, text, bigint, text, uuid, uuid), public.dispatch_due() from public, anon, authenticated;
grant execute on function public.create_poll(uuid, text, text[], boolean, uuid), public.send_thread_reply(uuid, text, uuid),
  public.send_attachment(uuid, text, text, text, bigint, text, uuid, uuid) to authenticated;
