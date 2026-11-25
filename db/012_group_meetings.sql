do $$
declare t text;
begin
  select data_type into t from information_schema.columns where table_schema = 'public' and table_name = 'app_config' and column_name = 'value';
  if t = 'jsonb' then
    insert into public.app_config(key, value, is_public) values ('meeting_max_participants', '8'::jsonb, false), ('meeting_notify_max', '50'::jsonb, false) on conflict (key) do nothing;
  else
    insert into public.app_config(key, value, is_public) values ('meeting_max_participants', '8', false), ('meeting_notify_max', '50', false) on conflict (key) do nothing;
  end if;
end $$;

create or replace function public.meeting_cfg(p_key text, p_def int) returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select nullif(btrim(a.value::text, '" '), '')::int from public.app_config a where a.key = p_key), p_def)
$$;
revoke all on function public.meeting_cfg(text, int) from public, anon, authenticated;

create or replace function public.create_meeting(p_conversation uuid, p_title text, p_mode text default 'video') returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); cj jsonb; isg boolean; ex uuid; mid uuid; ttl text; hn text; md text;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  md := case when p_mode = 'voice' then 'voice' else 'video' end;
  select to_jsonb(c) into cj from public.conversations c where c.id = p_conversation;
  if cj is null or not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = me) then return public.call_err('Chat not found.'); end if;
  isg := coalesce(cj->>'is_group', '') = 'true' or coalesce(cj->>'type', '') = 'group' or coalesce(cj->>'kind', '') = 'group';
  if not isg or coalesce(cj->>'is_channel', '') = 'true' then return public.call_err('Meetings can be started from group chats.'); end if;
  select m.id into ex from public.meetings m where m.meeting_type = 'group' and m.status = 'active' and m.conversation_id = p_conversation order by m.created_at desc limit 1;
  if ex is not null then return public.call_ok(jsonb_build_object('id', ex, 'existing', true)); end if;
  if (select count(*) from public.meetings m where m.created_by = me and m.created_at > now() - interval '1 minute') >= public.meeting_cfg('call_max_per_minute', 6) then return public.call_err('Too many calls. Wait a moment and try again.'); end if;
  ttl := left(coalesce(nullif(btrim(p_title), ''), 'Group meeting'), 60);
  insert into public.meetings(meeting_type, call_mode, status, title, room_name, conversation_id, created_by, answered_at)
  values ('group', md, 'active', ttl, 'm-' || replace(gen_random_uuid()::text, '-', ''), p_conversation, me, now()) returning id into mid;
  insert into public.meeting_participants(meeting_id, user_id, role, status, joined_at) values (mid, me, 'host', 'joined', now());
  perform public.call_event(mid, me, 'created');
  hn := public.call_name(me);
  insert into public.notifications(user_id, type, title, body, link)
  select m.user_id, 'meeting', left(coalesce(hn, 'Someone') || ' started a meeting', 120), ttl, '/messages/' || p_conversation::text
  from public.conversation_members m
  where m.conversation_id = p_conversation and m.user_id <> me and coalesce(m.muted::text, 'f') not in ('true', 't') and (m.muted_until is null or m.muted_until < now())
  order by m.joined_at limit public.meeting_cfg('meeting_notify_max', 50);
  return public.call_ok(jsonb_build_object('id', mid));
end $$;

create or replace function public.join_meeting(p_meeting uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); mt public.meetings; pr public.meeting_participants; cnt int;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into mt from public.meetings where id = p_meeting and meeting_type = 'group' for update;
  if mt.id is null or mt.status <> 'active' then return public.call_err('This meeting is no longer available.'); end if;
  select * into pr from public.meeting_participants where meeting_id = p_meeting and user_id = me;
  if pr.user_id is not null and pr.status = 'removed' then return public.call_err('You were removed from this meeting.'); end if;
  if pr.user_id is not null and pr.status = 'joined' then return public.call_ok(jsonb_build_object('id', p_meeting)); end if;
  if pr.user_id is null and not exists (select 1 from public.conversation_members m where m.conversation_id = mt.conversation_id and m.user_id = me) then return public.call_err('You are not a member of this chat.'); end if;
  select count(*) into cnt from public.meeting_participants where meeting_id = p_meeting and status = 'joined';
  if cnt >= public.meeting_cfg('meeting_max_participants', 8) then return public.call_err('This meeting is full.'); end if;
  if pr.user_id is null then
    insert into public.meeting_participants(meeting_id, user_id, role, status, joined_at) values (p_meeting, me, 'participant', 'joined', now());
  else
    update public.meeting_participants set status = 'joined', left_at = null, joined_at = now() where meeting_id = p_meeting and user_id = me;
  end if;
  perform public.call_event(p_meeting, me, 'joined');
  return public.call_ok(jsonb_build_object('id', p_meeting));
end $$;

create or replace function public.leave_meeting(p_meeting uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); mt public.meetings; pr public.meeting_participants; nx uuid;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into mt from public.meetings where id = p_meeting and meeting_type = 'group' for update;
  if mt.id is null then return public.call_err('Meeting not found.'); end if;
  select * into pr from public.meeting_participants where meeting_id = p_meeting and user_id = me;
  if pr.user_id is null or pr.status <> 'joined' then return public.call_ok(); end if;
  update public.meeting_participants set status = 'left', left_at = now() where meeting_id = p_meeting and user_id = me;
  perform public.call_event(p_meeting, me, 'left');
  if mt.status = 'active' then
    select user_id into nx from public.meeting_participants where meeting_id = p_meeting and status = 'joined' order by (role = 'moderator') desc, joined_at limit 1;
    if nx is null then
      perform public.call_finish(p_meeting, 'ended', 'empty');
    elsif pr.role = 'host' then
      update public.meeting_participants set role = 'host' where meeting_id = p_meeting and user_id = nx;
      update public.meeting_participants set role = 'participant' where meeting_id = p_meeting and user_id = me;
    end if;
  end if;
  return public.call_ok();
end $$;

create or replace function public.remove_participant(p_meeting uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); mr text; tr public.meeting_participants;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.meetings where id = p_meeting and meeting_type = 'group' and status = 'active') then return public.call_err('This meeting is no longer available.'); end if;
  select role into mr from public.meeting_participants where meeting_id = p_meeting and user_id = me and status = 'joined';
  if mr is null or mr not in ('host', 'moderator') then return public.call_err('Only the host or a moderator can remove people.'); end if;
  if p_user = me then return public.call_err('Use Leave to exit the meeting.'); end if;
  select * into tr from public.meeting_participants where meeting_id = p_meeting and user_id = p_user;
  if tr.user_id is null or tr.status <> 'joined' then return public.call_err('That person is not in the meeting.'); end if;
  if tr.role = 'host' or (mr = 'moderator' and tr.role = 'moderator') then return public.call_err('You cannot remove that person.'); end if;
  update public.meeting_participants set status = 'removed', left_at = now() where meeting_id = p_meeting and user_id = p_user;
  perform public.call_event(p_meeting, p_user, 'removed');
  return public.call_ok();
end $$;

create or replace function public.set_participant_role(p_meeting uuid, p_user uuid, p_role text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); tr public.meeting_participants;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if p_role not in ('moderator', 'participant') then return public.call_err('Invalid role.'); end if;
  if not exists (select 1 from public.meeting_participants where meeting_id = p_meeting and user_id = me and role = 'host' and status = 'joined') then return public.call_err('Only the host can change roles.'); end if;
  select * into tr from public.meeting_participants where meeting_id = p_meeting and user_id = p_user;
  if tr.user_id is null or tr.status <> 'joined' or tr.role = 'host' then return public.call_err('You cannot change that role.'); end if;
  update public.meeting_participants set role = p_role where meeting_id = p_meeting and user_id = p_user;
  perform public.call_event(p_meeting, p_user, 'role_' || p_role);
  return public.call_ok();
end $$;

create or replace function public.get_meeting(p_meeting uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); mt public.meetings; pr public.meeting_participants;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into mt from public.meetings where id = p_meeting and meeting_type = 'group';
  select * into pr from public.meeting_participants where meeting_id = p_meeting and user_id = me;
  if mt.id is null or pr.user_id is null then return public.call_err('Meeting not found.'); end if;
  return public.call_ok(jsonb_build_object('id', mt.id, 'status', mt.status, 'title', mt.title, 'mode', mt.call_mode, 'started_at', mt.answered_at, 'my_role', pr.role, 'my_status', pr.status, 'max', public.meeting_cfg('meeting_max_participants', 8),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', public.call_name(p.user_id), 'role', p.role) order by p.joined_at) from public.meeting_participants p where p.meeting_id = p_meeting and p.status = 'joined'), '[]'::jsonb)));
end $$;

create or replace function public.get_conversation_meeting(p_conversation uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); mt public.meetings;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = me) then return public.call_ok('{}'::jsonb); end if;
  select * into mt from public.meetings where meeting_type = 'group' and status = 'active' and conversation_id = p_conversation order by created_at desc limit 1;
  if mt.id is null then return public.call_ok('{}'::jsonb); end if;
  return public.call_ok(jsonb_build_object('id', mt.id, 'title', mt.title, 'mode', mt.call_mode, 'count', (select count(*) from public.meeting_participants where meeting_id = mt.id and status = 'joined')));
end $$;

revoke all on function public.create_meeting(uuid, text, text), public.join_meeting(uuid), public.leave_meeting(uuid), public.remove_participant(uuid, uuid), public.set_participant_role(uuid, uuid, text), public.get_meeting(uuid), public.get_conversation_meeting(uuid) from public, anon;
grant execute on function public.create_meeting(uuid, text, text), public.join_meeting(uuid), public.leave_meeting(uuid), public.remove_participant(uuid, uuid), public.set_participant_role(uuid, uuid, text), public.get_meeting(uuid), public.get_conversation_meeting(uuid) to authenticated;

do $$
declare d text; n text; cnt int;
begin
  d := pg_get_functiondef('public.end_call(uuid)'::regprocedure);
  select count(*) into cnt from regexp_matches(d, 'where\s+x\.id\s*=\s*p_meeting\s+and\s+p\.user_id\s*=\s*me\s*;', 'g');
  if cnt <> 1 then raise exception 'end_call anchor count %', cnt; end if;
  n := regexp_replace(d, '(where\s+x\.id\s*=\s*p_meeting\s+and\s+p\.user_id\s*=\s*me\s*;)', E'\\1\n if mt.id is not null and mt.meeting_type = ''group'' and not exists (select 1 from public.meeting_participants hp where hp.meeting_id = p_meeting and hp.user_id = me and hp.role = ''host'' and hp.status = ''joined'') then return public.call_err(''Only the host can end this meeting.''); end if;');
  execute n;
end $$;

with f(n) as (values ('public.create_meeting(uuid,text,text)'), ('public.join_meeting(uuid)'), ('public.leave_meeting(uuid)'), ('public.remove_participant(uuid,uuid)'), ('public.set_participant_role(uuid,uuid,text)'), ('public.get_meeting(uuid)'), ('public.get_conversation_meeting(uuid)'))
select jsonb_build_object(
  'cfg', (select count(*) from public.app_config where key in ('meeting_max_participants', 'meeting_notify_max')),
  'fn_anon', (select bool_or(has_function_privilege('anon', n, 'execute')) from f),
  'fn_auth', (select bool_and(has_function_privilege('authenticated', n, 'execute')) from f),
  'end_host', position('Only the host can end' in pg_get_functiondef('public.end_call(uuid)'::regprocedure)) > 0,
  'conv_cols', (select left(string_agg(column_name, ','), 300) from information_schema.columns where table_schema = 'public' and table_name = 'conversations')
);
