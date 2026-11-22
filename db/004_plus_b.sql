do $$
begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name in ('user_id', 'type', 'title', 'body', 'link')) < 5 then
    raise exception 'notifications is missing user_id, type, title, body or link';
  end if;
end $$;

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  send_at timestamptz not null,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sm_due_idx on public.scheduled_messages (send_at) where sent_at is null and cancelled_at is null;
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  note text not null check (char_length(note) between 1 and 200),
  remind_at timestamptz not null,
  fired_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rem_due_idx on public.reminders (remind_at) where fired_at is null and cancelled_at is null;
alter table public.scheduled_messages enable row level security;
alter table public.reminders enable row level security;
revoke all on public.scheduled_messages, public.reminders from anon, authenticated;

create or replace function public.schedule_message(p_conversation uuid, p_body text, p_send_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); s public.scheduled_messages;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if b = '' then return jsonb_build_object('ok', false, 'error', 'Message is empty.'); end if;
  if char_length(b) > 4000 then return jsonb_build_object('ok', false, 'error', 'Message is too long.'); end if;
  if p_send_at is null or p_send_at <= now() then return jsonb_build_object('ok', false, 'error', 'Choose a time in the future.'); end if;
  if p_send_at > now() + interval '90 days' then return jsonb_build_object('ok', false, 'error', 'Schedule up to 90 days ahead.'); end if;
  if (select count(*) from public.scheduled_messages where sender_id = me and sent_at is null and cancelled_at is null) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'You have 50 scheduled messages already.');
  end if;
  insert into public.scheduled_messages(conversation_id, sender_id, body, send_at) values (p_conversation, me, b, p_send_at) returning * into s;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', s.id, 'send_at', s.send_at));
end $$;

create or replace function public.list_scheduled(p_conversation uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'conversation_id', conversation_id, 'body', body, 'send_at', send_at) order by send_at), '[]'::jsonb) into r
    from public.scheduled_messages
    where sender_id = me and sent_at is null and cancelled_at is null and (p_conversation is null or conversation_id = p_conversation);
  return jsonb_build_object('ok', true, 'data', r);
end $$;

create or replace function public.cancel_scheduled(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.scheduled_messages set cancelled_at = now() where id = p_id and sender_id = auth.uid() and sent_at is null and cancelled_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'Already sent or not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

create or replace function public.create_reminder(p_note text, p_remind_at timestamptz, p_conversation uuid default null, p_message uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_note, '')); cid uuid := p_conversation; rid public.reminders;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if n = '' or char_length(n) > 200 then return jsonb_build_object('ok', false, 'error', 'Reminder text must be 1 to 200 characters.'); end if;
  if p_remind_at is null or p_remind_at <= now() then return jsonb_build_object('ok', false, 'error', 'Choose a time in the future.'); end if;
  if p_remind_at > now() + interval '1 year' then return jsonb_build_object('ok', false, 'error', 'Remind up to 1 year ahead.'); end if;
  if p_message is not null then
    select conversation_id into cid from public.messages where id = p_message;
    if cid is null then return jsonb_build_object('ok', false, 'error', 'Message not found.'); end if;
  end if;
  if cid is not null and not public.is_member(cid) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
  if (select count(*) from public.reminders where user_id = me and fired_at is null and cancelled_at is null) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'You have 100 reminders already.');
  end if;
  insert into public.reminders(user_id, conversation_id, message_id, note, remind_at) values (me, cid, p_message, n, p_remind_at) returning * into rid;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', rid.id, 'remind_at', rid.remind_at));
end $$;

create or replace function public.list_reminders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'note', note, 'remind_at', remind_at, 'conversation_id', conversation_id) order by remind_at), '[]'::jsonb) into r
    from public.reminders where user_id = auth.uid() and fired_at is null and cancelled_at is null;
  return jsonb_build_object('ok', true, 'data', r);
end $$;

create or replace function public.cancel_reminder(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.reminders set cancelled_at = now() where id = p_id and user_id = auth.uid() and fired_at is null and cancelled_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'Already fired or not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

create or replace function public.dispatch_due() returns void
language plpgsql security definer set search_path = public as $$
declare s record; r record; m public.messages;
begin
  for s in select * from public.scheduled_messages where sent_at is null and cancelled_at is null and send_at <= now() order by send_at limit 100 for update skip locked loop
    if exists (select 1 from public.conversation_members where conversation_id = s.conversation_id and user_id = s.sender_id) then
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

do $$
begin
  if to_regprocedure('public.home_summary_base()') is null then
    alter function public.home_summary() rename to home_summary_base;
  end if;
end $$;

create or replace function public.home_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b jsonb; n int; ser jsonb;
begin
  b := public.home_summary_base();
  if me is null or (b->>'ok') is distinct from 'true' then return b; end if;
  select count(*) into n from (
    select 1 from public.scheduled_messages where sender_id = me and sent_at is null and cancelled_at is null
    union all select 1 from public.reminders where user_id = me and fired_at is null and cancelled_at is null) u;
  select to_jsonb(array_agg(coalesce(x.c, 0) order by d.day)) into ser
    from (select gs::date as day from generate_series(current_date::timestamp, (current_date + 6)::timestamp, interval '1 day') gs) d
    left join (select u.t::date as day, count(*) as c from (
        select send_at as t from public.scheduled_messages where sender_id = me and sent_at is null and cancelled_at is null
        union all select remind_at from public.reminders where user_id = me and fired_at is null and cancelled_at is null) u
      group by u.t::date) x on x.day = d.day;
  return jsonb_set(b, '{data,scheduled}', jsonb_build_object('value', n, 'series', ser));
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'xentra_dispatch_due';
    perform cron.schedule('xentra_dispatch_due', '* * * * *', 'select public.dispatch_due()');
  end if;
end $$;

revoke all on function public.schedule_message(uuid, text, timestamptz), public.list_scheduled(uuid), public.cancel_scheduled(uuid),
  public.create_reminder(text, timestamptz, uuid, uuid), public.list_reminders(), public.cancel_reminder(uuid),
  public.home_summary(), public.home_summary_base(), public.dispatch_due() from public, anon, authenticated;
grant execute on function public.schedule_message(uuid, text, timestamptz), public.list_scheduled(uuid), public.cancel_scheduled(uuid),
  public.create_reminder(text, timestamptz, uuid, uuid), public.list_reminders(), public.cancel_reminder(uuid), public.home_summary() to authenticated;
