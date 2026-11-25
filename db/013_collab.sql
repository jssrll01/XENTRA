do $$
declare t text;
begin
  select data_type into t from information_schema.columns where table_schema = 'public' and table_name = 'app_config' and column_name = 'value';
  if t = 'jsonb' then
    insert into public.app_config(key, value, is_public) values ('meeting_chat_retention_days', '30'::jsonb, false), ('meeting_link_hours', '24'::jsonb, false) on conflict (key) do nothing;
  else
    insert into public.app_config(key, value, is_public) values ('meeting_chat_retention_days', '30', false), ('meeting_link_hours', '24', false) on conflict (key) do nothing;
  end if;
end $$;

alter table public.meetings add column if not exists lobby boolean not null default false;
alter table public.meeting_participants add column if not exists hand_at timestamptz;
alter table public.meeting_participants add column if not exists reaction text check (reaction is null or char_length(reaction) <= 10);
alter table public.meeting_participants add column if not exists reaction_at timestamptz;

create table if not exists public.meeting_chat_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists meeting_chat_messages_meeting_idx on public.meeting_chat_messages(meeting_id, created_at);
alter table public.meeting_chat_messages enable row level security;
revoke all on table public.meeting_chat_messages from anon, authenticated;

create table if not exists public.meeting_links (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  code text not null unique check (char_length(code) between 16 and 64),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists meeting_links_meeting_idx on public.meeting_links(meeting_id);
alter table public.meeting_links enable row level security;
revoke all on table public.meeting_links from anon, authenticated;

create or replace function public.set_hand(p_meeting uuid, p_up boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return public.call_err('Not signed in.'); end if;
  update public.meeting_participants set hand_at = case when p_up then now() else null end where meeting_id = p_meeting and user_id = auth.uid() and status = 'joined';
  return public.call_ok();
end $$;

create or replace function public.send_reaction(p_meeting uuid, p_key text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return public.call_err('Not signed in.'); end if;
  if p_key not in ('like', 'clap', 'heart', 'laugh', 'party', 'wow') then return public.call_err('Invalid reaction.'); end if;
  update public.meeting_participants set reaction = p_key, reaction_at = now() where meeting_id = p_meeting and user_id = auth.uid() and status = 'joined' and (reaction_at is null or reaction_at < now() - interval '1 second');
  return public.call_ok();
end $$;

create or replace function public.send_meeting_chat(p_meeting uuid, p_body text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); mid uuid;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.meeting_participants where meeting_id = p_meeting and user_id = me and status = 'joined') then return public.call_err('Not in this meeting.'); end if;
  if char_length(b) < 1 or char_length(b) > 500 then return public.call_err('Messages can be 1 to 500 characters.'); end if;
  if (select count(*) from public.meeting_chat_messages where meeting_id = p_meeting and user_id = me and created_at > now() - interval '10 seconds') >= 10 then return public.call_err('You are sending messages too fast.'); end if;
  insert into public.meeting_chat_messages(meeting_id, user_id, body) values (p_meeting, me, b) returning id into mid;
  return public.call_ok(jsonb_build_object('id', mid));
end $$;

create or replace function public.list_meeting_chat(p_meeting uuid, p_after timestamptz default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.meeting_participants where meeting_id = p_meeting and user_id = me and status = 'joined') then return public.call_err('Not in this meeting.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'user_id', x.user_id, 'name', public.call_name(x.user_id), 'body', x.body, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb) into res
  from (select * from public.meeting_chat_messages where meeting_id = p_meeting and (p_after is null or created_at > p_after) order by created_at desc limit 50) x;
  return public.call_ok(res);
end $$;

create or replace function public.meeting_chat_purge() returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from public.meeting_chat_messages where created_at < now() - make_interval(days => public.meeting_cfg('meeting_chat_retention_days', 30));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.meeting_chat_purge() from public, anon, authenticated;

create or replace function public.set_meeting_lobby(p_meeting uuid, p_on boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.meeting_participants where meeting_id = p_meeting and user_id = me and status = 'joined' and role in ('host', 'moderator')) then return public.call_err('Only the host or a moderator can change the lobby.'); end if;
  update public.meetings set lobby = coalesce(p_on, false) where id = p_meeting and meeting_type = 'group' and status = 'active';
  return public.call_ok();
end $$;

create or replace function public.admit_participant(p_meeting uuid, p_user uuid, p_ok boolean) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); tr public.meeting_participants;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  perform 1 from public.meetings where id = p_meeting and meeting_type = 'group' and status = 'active' for update;
  if not found then return public.call_err('This meeting is no longer available.'); end if;
  if not exists (select 1 from public.meeting_participants where meeting_id = p_meeting and user_id = me and status = 'joined' and role in ('host', 'moderator')) then return public.call_err('Only the host or a moderator can admit people.'); end if;
  select * into tr from public.meeting_participants where meeting_id = p_meeting and user_id = p_user;
  if tr.user_id is null or tr.status <> 'invited' then return public.call_err('That person is not waiting.'); end if;
  if p_ok then
    if (select count(*) from public.meeting_participants where meeting_id = p_meeting and status = 'joined') >= public.meeting_cfg('meeting_max_participants', 8) then return public.call_err('This meeting is full.'); end if;
    update public.meeting_participants set status = 'joined', joined_at = now(), hand_at = null, reaction = null where meeting_id = p_meeting and user_id = p_user;
    perform public.call_event(p_meeting, p_user, 'admitted');
  else
    update public.meeting_participants set status = 'declined' where meeting_id = p_meeting and user_id = p_user;
    perform public.call_event(p_meeting, p_user, 'denied');
  end if;
  return public.call_ok();
end $$;

create or replace function public.create_meeting_link(p_meeting uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); c text; ex timestamptz;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.meetings where id = p_meeting and meeting_type = 'group' and status = 'active') then return public.call_err('This meeting is no longer available.'); end if;
  if not exists (select 1 from public.meeting_participants where meeting_id = p_meeting and user_id = me and status = 'joined' and role in ('host', 'moderator')) then return public.call_err('Only the host or a moderator can create invite links.'); end if;
  c := replace(gen_random_uuid()::text, '-', '');
  ex := now() + make_interval(hours => public.meeting_cfg('meeting_link_hours', 24));
  insert into public.meeting_links(meeting_id, code, created_by, expires_at) values (p_meeting, c, me, ex);
  perform public.call_event(p_meeting, me, 'link_created');
  return public.call_ok(jsonb_build_object('code', c, 'expires_at', ex));
end $$;

create or replace function public.revoke_meeting_links(p_meeting uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.meeting_participants where meeting_id = p_meeting and user_id = me and status = 'joined' and role in ('host', 'moderator')) then return public.call_err('Only the host or a moderator can revoke links.'); end if;
  update public.meeting_links set revoked_at = now() where meeting_id = p_meeting and revoked_at is null;
  return public.call_ok();
end $$;

create or replace function public.join_meeting_by_code(p_code text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); ln public.meeting_links; mt public.meetings; pr public.meeting_participants; st text;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into ln from public.meeting_links where code = btrim(coalesce(p_code, ''));
  if ln.id is null or ln.revoked_at is not null or ln.expires_at < now() then return public.call_err('This invite link has expired or is no longer valid.'); end if;
  select * into mt from public.meetings where id = ln.meeting_id and meeting_type = 'group' for update;
  if mt.id is null or mt.status <> 'active' then return public.call_err('This meeting has ended.'); end if;
  select * into pr from public.meeting_participants where meeting_id = mt.id and user_id = me;
  if pr.user_id is not null and pr.status = 'removed' then return public.call_err('You were removed from this meeting.'); end if;
  if pr.user_id is not null and pr.status = 'declined' then return public.call_err('The host did not let you in.'); end if;
  if pr.user_id is null or pr.status in ('left', 'invited') then
    if not mt.lobby and (select count(*) from public.meeting_participants where meeting_id = mt.id and status = 'joined') >= public.meeting_cfg('meeting_max_participants', 8) then return public.call_err('This meeting is full.'); end if;
    st := case when mt.lobby then 'invited' else 'joined' end;
    if pr.user_id is null then
      insert into public.meeting_participants(meeting_id, user_id, role, status, joined_at) values (mt.id, me, 'participant', st, now());
    else
      update public.meeting_participants set status = st, left_at = null, joined_at = now(), hand_at = null, reaction = null where meeting_id = mt.id and user_id = me;
    end if;
    perform public.call_event(mt.id, me, 'joined_by_link');
  end if;
  return public.call_ok(jsonb_build_object('id', mt.id, 'title', mt.title, 'mode', mt.call_mode));
end $$;

create or replace function public.join_meeting(p_meeting uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); mt public.meetings; pr public.meeting_participants; wait boolean;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into mt from public.meetings where id = p_meeting and meeting_type = 'group' for update;
  if mt.id is null or mt.status <> 'active' then return public.call_err('This meeting is no longer available.'); end if;
  select * into pr from public.meeting_participants where meeting_id = p_meeting and user_id = me;
  if pr.user_id is not null and pr.status = 'removed' then return public.call_err('You were removed from this meeting.'); end if;
  if pr.user_id is not null and pr.status = 'declined' then return public.call_err('The host did not let you in.'); end if;
  if pr.user_id is not null and pr.status = 'joined' then return public.call_ok(jsonb_build_object('id', p_meeting)); end if;
  if pr.user_id is null and not exists (select 1 from public.conversation_members m where m.conversation_id = mt.conversation_id and m.user_id = me) then return public.call_err('You are not a member of this chat.'); end if;
  wait := mt.lobby and (pr.user_id is null or pr.status = 'invited');
  if wait then
    if pr.user_id is null then
      insert into public.meeting_participants(meeting_id, user_id, role, status, joined_at) values (p_meeting, me, 'participant', 'invited', now());
    else
      update public.meeting_participants set joined_at = now() where meeting_id = p_meeting and user_id = me;
    end if;
    return public.call_ok(jsonb_build_object('id', p_meeting, 'waiting', true));
  end if;
  if (select count(*) from public.meeting_participants where meeting_id = p_meeting and status = 'joined') >= public.meeting_cfg('meeting_max_participants', 8) then return public.call_err('This meeting is full.'); end if;
  if pr.user_id is null then
    insert into public.meeting_participants(meeting_id, user_id, role, status, joined_at) values (p_meeting, me, 'participant', 'joined', now());
  else
    update public.meeting_participants set status = 'joined', left_at = null, joined_at = now(), hand_at = null, reaction = null where meeting_id = p_meeting and user_id = me;
  end if;
  perform public.call_event(p_meeting, me, 'joined');
  return public.call_ok(jsonb_build_object('id', p_meeting));
end $$;

create or replace function public.get_meeting(p_meeting uuid) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); mt public.meetings; pr public.meeting_participants; mem jsonb := '[]'::jsonb; wt jsonb := '[]'::jsonb;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into mt from public.meetings where id = p_meeting and meeting_type = 'group';
  select * into pr from public.meeting_participants where meeting_id = p_meeting and user_id = me;
  if mt.id is null or pr.user_id is null then return public.call_err('Meeting not found.'); end if;
  if pr.status = 'invited' then update public.meeting_participants set joined_at = now() where meeting_id = p_meeting and user_id = me; end if;
  if pr.status = 'joined' then
    select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', public.call_name(p.user_id), 'role', p.role, 'hand', p.hand_at is not null, 'reaction', case when p.reaction_at > now() - interval '4 seconds' then p.reaction else null end) order by p.joined_at), '[]'::jsonb) into mem
    from public.meeting_participants p where p.meeting_id = p_meeting and p.status = 'joined';
    if pr.role in ('host', 'moderator') then
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', public.call_name(p.user_id)) order by p.joined_at), '[]'::jsonb) into wt
      from public.meeting_participants p where p.meeting_id = p_meeting and p.status = 'invited' and p.joined_at > now() - interval '30 seconds';
    end if;
  end if;
  return public.call_ok(jsonb_build_object('id', mt.id, 'status', mt.status, 'title', mt.title, 'mode', mt.call_mode, 'started_at', mt.answered_at, 'my_role', pr.role, 'my_status', pr.status, 'lobby', mt.lobby, 'max', public.meeting_cfg('meeting_max_participants', 8), 'members', mem, 'waiting', wt));
end $$;

revoke all on function public.set_hand(uuid, boolean), public.send_reaction(uuid, text), public.send_meeting_chat(uuid, text), public.list_meeting_chat(uuid, timestamptz), public.set_meeting_lobby(uuid, boolean), public.admit_participant(uuid, uuid, boolean), public.create_meeting_link(uuid), public.revoke_meeting_links(uuid), public.join_meeting_by_code(text) from public, anon;
grant execute on function public.set_hand(uuid, boolean), public.send_reaction(uuid, text), public.send_meeting_chat(uuid, text), public.list_meeting_chat(uuid, timestamptz), public.set_meeting_lobby(uuid, boolean), public.admit_participant(uuid, uuid, boolean), public.create_meeting_link(uuid), public.revoke_meeting_links(uuid), public.join_meeting_by_code(text), public.join_meeting(uuid), public.get_meeting(uuid) to authenticated;

with f(n) as (values ('public.set_hand(uuid,boolean)'), ('public.send_reaction(uuid,text)'), ('public.send_meeting_chat(uuid,text)'), ('public.list_meeting_chat(uuid,timestamptz)'), ('public.set_meeting_lobby(uuid,boolean)'), ('public.admit_participant(uuid,uuid,boolean)'), ('public.create_meeting_link(uuid)'), ('public.revoke_meeting_links(uuid)'), ('public.join_meeting_by_code(text)'), ('public.join_meeting(uuid)'), ('public.get_meeting(uuid)'))
select jsonb_build_object(
  'rls', (select jsonb_agg(c.relrowsecurity) from pg_class c where c.oid in ('public.meeting_chat_messages'::regclass, 'public.meeting_links'::regclass)),
  'tbl_anon', has_table_privilege('anon', 'public.meeting_chat_messages', 'select') or has_table_privilege('anon', 'public.meeting_links', 'select'),
  'tbl_auth', has_table_privilege('authenticated', 'public.meeting_chat_messages', 'select') or has_table_privilege('authenticated', 'public.meeting_links', 'select'),
  'cols', (select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'meetings' and column_name = 'lobby') or (table_name = 'meeting_participants' and column_name in ('hand_at', 'reaction', 'reaction_at')))),
  'cfg', (select count(*) from public.app_config where key in ('meeting_chat_retention_days', 'meeting_link_hours')),
  'fn_anon', (select bool_or(has_function_privilege('anon', n, 'execute')) from f),
  'fn_auth', (select bool_and(has_function_privilege('authenticated', n, 'execute')) from f)
);
