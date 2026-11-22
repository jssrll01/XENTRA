create or replace function public.send_thread_reply(p_root uuid, p_body text, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.messages; m public.messages; b text := btrim(coalesce(p_body, ''));
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into r from public.messages where id = p_root and deleted_at is null and thread_root is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if not public.is_member(r.conversation_id) then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if char_length(b) < 1 or char_length(b) > 4000 then return jsonb_build_object('ok', false, 'error', 'Reply must be 1 to 4000 characters.'); end if;
  if p_client_id is not null then
    select * into m from public.messages where sender_id = me and client_id = p_client_id;
    if found then return jsonb_build_object('ok', true, 'data', to_jsonb(m)); end if;
  end if;
  insert into public.messages(conversation_id, sender_id, body, client_id, thread_root) values (r.conversation_id, me, b, p_client_id, p_root) returning * into m;
  update public.conversation_members set last_read_at = now() where conversation_id = r.conversation_id and user_id = me;
  return jsonb_build_object('ok', true, 'data', to_jsonb(m));
end $$;

create or replace function public.list_thread(p_root uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.messages; rep jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into r from public.messages where id = p_root and thread_root is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  if not public.is_member(r.conversation_id) then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'sender_id', x.sender_id, 'body', case when x.deleted_at is null then x.body else '' end,
    'deleted', x.deleted_at is not null, 'edited_at', x.edited_at, 'client_id', x.client_id, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb) into rep
    from public.messages x where x.thread_root = p_root;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'root', jsonb_build_object('id', r.id, 'sender_id', r.sender_id, 'body', case when r.deleted_at is null then r.body else '' end, 'deleted', r.deleted_at is not null, 'created_at', r.created_at),
    'replies', rep));
end $$;

create or replace function public.send_attachment(p_conversation uuid, p_path text, p_name text, p_mime text, p_size bigint, p_caption text default null, p_client_id uuid default null, p_thread_root uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.messages; nm text := btrim(coalesce(p_name, '')); cap text := btrim(coalesce(p_caption, ''));
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
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
      'thread_count', (select count(*) from public.messages r2 where r2.thread_root = m.id and r2.deleted_at is null),
      'attachments', case when m.deleted_at is null then coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'name', a.name, 'mime', a.mime, 'size', a.size) order by a.created_at) from public.message_attachments a where a.message_id = m.id), '[]'::jsonb) else '[]'::jsonb end,
      'poll', case when m.deleted_at is null then (select jsonb_build_object('id', pl.id, 'multiple', pl.multiple, 'closed', pl.closed_at is not null, 'owner', pl.created_by = me,
                  'voters', (select count(distinct v.user_id) from public.poll_votes v where v.poll_id = pl.id),
                  'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
                      'count', (select count(*) from public.poll_votes v where v.option_id = o.id),
                      'mine', exists (select 1 from public.poll_votes v where v.option_id = o.id and v.user_id = me)) order by o.pos)
                    from public.poll_options o where o.poll_id = pl.id))
                from public.polls pl where pl.message_id = m.id) else null end,
      'reply', (select jsonb_build_object('id', q.id, 'sender_id', q.sender_id, 'deleted', q.deleted_at is not null,
                  'body', case when q.deleted_at is null then left(q.body, 140) else '' end)
                from public.messages q where q.id = m.reply_to),
      'reactions', coalesce((select jsonb_agg(jsonb_build_object('emoji', g.emoji, 'count', g.n, 'mine', g.mine))
                  from (select emoji, count(*) as n, bool_or(user_id = me) as mine from public.message_reactions where message_id = m.id group by emoji) g), '[]'::jsonb)
    ) as j
    from public.messages m
    where m.conversation_id = p_conversation and m.thread_root is null and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) t;
  return jsonb_build_object('ok', true, 'data', r);
end $$;

revoke all on function public.send_thread_reply(uuid, text, uuid), public.list_thread(uuid),
  public.send_attachment(uuid, text, text, text, bigint, text, uuid, uuid), public.list_messages(uuid, timestamptz, int) from public, anon, authenticated;
grant execute on function public.send_thread_reply(uuid, text, uuid), public.list_thread(uuid),
  public.send_attachment(uuid, text, text, text, bigint, text, uuid, uuid), public.list_messages(uuid, timestamptz, int) to authenticated;
