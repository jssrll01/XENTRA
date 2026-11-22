alter table public.messages add column if not exists thread_root uuid references public.messages(id) on delete cascade;
create index if not exists messages_thread_idx on public.messages(thread_root) where thread_root is not null;

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  multiple boolean not null default false,
  closed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  pos int not null
);
create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  path text not null,
  name text not null,
  mime text not null,
  size bigint not null,
  created_at timestamptz not null default now()
);
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.message_attachments enable row level security;
revoke all on public.polls, public.poll_options, public.poll_votes, public.message_attachments from anon, authenticated;

create or replace function public.create_poll(p_conversation uuid, p_question text, p_options text[], p_multiple boolean default false, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); q text := btrim(coalesce(p_question, '')); opts text[]; m public.messages; pid uuid; i int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if not public.is_member(p_conversation) then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
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

create or replace function public.vote_poll(p_poll uuid, p_option uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.polls;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into p from public.polls where id = p_poll;
  if not found then return jsonb_build_object('ok', false, 'error', 'Poll not found.'); end if;
  if not public.is_member(p.conversation_id) then return jsonb_build_object('ok', false, 'error', 'Poll not found.'); end if;
  if p.closed_at is not null then return jsonb_build_object('ok', false, 'error', 'This poll is closed.'); end if;
  if not exists (select 1 from public.poll_options where id = p_option and poll_id = p_poll) then return jsonb_build_object('ok', false, 'error', 'Option not found.'); end if;
  delete from public.poll_votes where option_id = p_option and user_id = me;
  if found then return jsonb_build_object('ok', true, 'data', jsonb_build_object('on', false)); end if;
  if not p.multiple then delete from public.poll_votes where poll_id = p_poll and user_id = me; end if;
  insert into public.poll_votes(poll_id, option_id, user_id, conversation_id) values (p_poll, p_option, me, p.conversation_id);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('on', true));
end $$;

create or replace function public.close_poll(p_poll uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.polls set closed_at = now() where id = p_poll and created_by = me and closed_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'Only the poll creator can close an open poll.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

revoke all on function public.create_poll(uuid, text, text[], boolean, uuid), public.vote_poll(uuid, uuid), public.close_poll(uuid) from public, anon, authenticated;
grant execute on function public.create_poll(uuid, text, text[], boolean, uuid), public.vote_poll(uuid, uuid), public.close_poll(uuid) to authenticated;
