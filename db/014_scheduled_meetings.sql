create table if not exists public.scheduled_meetings (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_meetings_chat_idx on public.scheduled_meetings (conversation_id, starts_at);
create index if not exists scheduled_meetings_due_idx on public.scheduled_meetings (starts_at) where status = 'scheduled' and reminded_at is null;
alter table public.scheduled_meetings enable row level security;
revoke all on public.scheduled_meetings from public, anon, authenticated;

insert into public.app_config (key, value) values ('meeting_schedule_max_days', '90') on conflict do nothing;
insert into public.app_config (key, value) values ('meeting_schedule_max_per_chat', '20') on conflict do nothing;
insert into public.app_config (key, value) values ('meeting_remind_minutes', '10') on conflict do nothing;

create or replace function public.sched_cfg(k text, d integer) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(c.value::text, '')::integer from public.app_config c where c.key = k), d)
$$;

create or replace function public.schedule_meeting(p_conversation uuid, p_title text, p_starts timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; t text; mx integer; cap integer; n integer; nid uuid;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = me) then
    return public.call_err('Chat not found.');
  end if;
  select c.kind into k from public.conversations c where c.id = p_conversation;
  if k is distinct from 'group' then return public.call_err('Meetings can be scheduled in group chats.'); end if;
  t := left(btrim(coalesce(p_title, '')), 80);
  if t = '' then t := 'Meeting'; end if;
  if p_starts is null then return public.call_err('Pick a date and time.'); end if;
  if p_starts < now() + interval '1 minute' then return public.call_err('Pick a time in the future.'); end if;
  mx := public.sched_cfg('meeting_schedule_max_days', 90);
  if p_starts > now() + make_interval(days => mx) then return public.call_err('Pick a time within the next ' || mx || ' days.'); end if;
  cap := public.sched_cfg('meeting_schedule_max_per_chat', 20);
  select count(*) into n from public.scheduled_meetings s where s.conversation_id = p_conversation and s.status = 'scheduled' and s.starts_at > now();
  if n >= cap then return public.call_err('This chat already has ' || cap || ' scheduled meetings. Cancel one first.'); end if;
  insert into public.scheduled_meetings (conversation_id, host_id, title, starts_at) values (p_conversation, me, t, p_starts) returning id into nid;
  return public.call_ok(jsonb_build_object('id', nid));
end $$;

create or replace function public.list_scheduled_meetings(p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = me) then
    return public.call_err('Chat not found.');
  end if;
  return public.call_ok(jsonb_build_object(
    'max_days', public.sched_cfg('meeting_schedule_max_days', 90),
    'live', exists (select 1 from public.meetings g where g.meeting_type = 'group' and g.status = 'active' and g.conversation_id = p_conversation),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'mine', s.host_id = me) order by s.starts_at)
      from public.scheduled_meetings s
      where s.conversation_id = p_conversation and s.status = 'scheduled' and s.starts_at > now() - interval '2 hours'), '[]'::jsonb)));
end $$;

create or replace function public.update_scheduled_meeting(p_id uuid, p_title text, p_starts timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.scheduled_meetings%rowtype; t text; mx integer;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into r from public.scheduled_meetings s where s.id = p_id for update;
  if not found then return public.call_err('Meeting not found.'); end if;
  if r.host_id <> me then return public.call_err('Only the host can change this meeting.'); end if;
  if r.status <> 'scheduled' then return public.call_err('This meeting was cancelled.'); end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = r.conversation_id and m.user_id = me) then
    return public.call_err('You are no longer in this chat.');
  end if;
  t := left(btrim(coalesce(p_title, '')), 80);
  if t = '' then t := 'Meeting'; end if;
  if p_starts is null then return public.call_err('Pick a date and time.'); end if;
  if p_starts < now() + interval '1 minute' then return public.call_err('Pick a time in the future.'); end if;
  mx := public.sched_cfg('meeting_schedule_max_days', 90);
  if p_starts > now() + make_interval(days => mx) then return public.call_err('Pick a time within the next ' || mx || ' days.'); end if;
  update public.scheduled_meetings set title = t, starts_at = p_starts, reminded_at = null, updated_at = now() where id = p_id;
  return public.call_ok(jsonb_build_object('id', p_id));
end $$;

create or replace function public.cancel_scheduled_meeting(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.scheduled_meetings%rowtype;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into r from public.scheduled_meetings s where s.id = p_id for update;
  if not found then return public.call_err('Meeting not found.'); end if;
  if r.host_id <> me then return public.call_err('Only the host can cancel this meeting.'); end if;
  update public.scheduled_meetings set status = 'cancelled', updated_at = now() where id = p_id and status = 'scheduled';
  return public.call_ok(jsonb_build_object('id', p_id));
end $$;

create or replace function public.meeting_remind_due() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; total integer := 0; lead integer; cap integer;
begin
  lead := public.sched_cfg('meeting_remind_minutes', 10);
  cap := public.sched_cfg('meeting_notify_max', 50);
  for r in
    update public.scheduled_meetings s set reminded_at = now()
    where s.status = 'scheduled' and s.reminded_at is null
      and s.starts_at <= now() + make_interval(mins => lead)
      and s.starts_at > now() - interval '30 minutes'
    returning s.id, s.conversation_id, s.title, s.starts_at
  loop
    insert into public.notifications (user_id, type, title, body, link)
    select m.user_id, 'meeting', left(r.title, 80),
      case when r.starts_at <= now() then 'Starting now.' else 'Starts in about ' || greatest(1, ceil(extract(epoch from (r.starts_at - now())) / 60))::integer || ' minutes.' end,
      '/messages/' || r.conversation_id::text
    from public.conversation_members m
    where m.conversation_id = r.conversation_id
    order by m.joined_at
    limit cap;
    total := total + 1;
  end loop;
  return total;
end $$;

revoke all on function public.sched_cfg(text, integer) from public, anon, authenticated;
revoke all on function public.meeting_remind_due() from public, anon, authenticated;
revoke all on function public.schedule_meeting(uuid, text, timestamptz) from public, anon;
revoke all on function public.list_scheduled_meetings(uuid) from public, anon;
revoke all on function public.update_scheduled_meeting(uuid, text, timestamptz) from public, anon;
revoke all on function public.cancel_scheduled_meeting(uuid) from public, anon;
grant execute on function public.schedule_meeting(uuid, text, timestamptz) to authenticated;
grant execute on function public.list_scheduled_meetings(uuid) to authenticated;
grant execute on function public.update_scheduled_meeting(uuid, text, timestamptz) to authenticated;
grant execute on function public.cancel_scheduled_meeting(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'xentra_meeting_remind') then
    perform cron.schedule('xentra_meeting_remind', '* * * * *', 'select public.meeting_remind_due()');
  end if;
end $$;

select jsonb_build_object(
  'rls', (select relrowsecurity from pg_class where oid = 'public.scheduled_meetings'::regclass),
  'tbl_anon', has_table_privilege('anon', 'public.scheduled_meetings', 'select'),
  'tbl_auth', has_table_privilege('authenticated', 'public.scheduled_meetings', 'select'),
  'fn_anon', (has_function_privilege('anon', 'public.schedule_meeting(uuid,text,timestamptz)', 'execute') or has_function_privilege('anon', 'public.list_scheduled_meetings(uuid)', 'execute') or has_function_privilege('anon', 'public.update_scheduled_meeting(uuid,text,timestamptz)', 'execute') or has_function_privilege('anon', 'public.cancel_scheduled_meeting(uuid)', 'execute')),
  'fn_auth', (has_function_privilege('authenticated', 'public.schedule_meeting(uuid,text,timestamptz)', 'execute') and has_function_privilege('authenticated', 'public.list_scheduled_meetings(uuid)', 'execute') and has_function_privilege('authenticated', 'public.update_scheduled_meeting(uuid,text,timestamptz)', 'execute') and has_function_privilege('authenticated', 'public.cancel_scheduled_meeting(uuid)', 'execute')),
  'helpers_closed', (not has_function_privilege('authenticated', 'public.meeting_remind_due()', 'execute') and not has_function_privilege('authenticated', 'public.sched_cfg(text,integer)', 'execute')),
  'cron', exists (select 1 from cron.job where jobname = 'xentra_meeting_remind'),
  'cfg', (select count(*) from public.app_config where key in ('meeting_schedule_max_days', 'meeting_schedule_max_per_chat', 'meeting_remind_minutes'))
);
