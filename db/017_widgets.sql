create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  done boolean not null default false,
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 100),
  body text not null default '' check (char_length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todos_u on public.todos(user_id, done, created_at desc);
create index if not exists events_u on public.events(user_id, starts_at);
create index if not exists notes_u on public.notes(user_id, updated_at desc);
alter table public.todos enable row level security;
alter table public.events enable row level security;
alter table public.notes enable row level security;
revoke all on public.todos, public.events, public.notes from anon, authenticated;
drop policy if exists todos_own on public.todos;
create policy todos_own on public.todos for select to authenticated using (user_id = auth.uid());
drop policy if exists events_own on public.events;
create policy events_own on public.events for select to authenticated using (user_id = auth.uid());
drop policy if exists notes_own on public.notes;
create policy notes_own on public.notes for select to authenticated using (user_id = auth.uid());

create or replace function public.list_todos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', text, 'done', done, 'due_at', due_at) order by done, due_at nulls last, created_at desc), '[]'::jsonb) into r from public.todos where user_id = me;
  return public.jok(r);
end $$;
create or replace function public.add_todo(p_text text, p_due timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); n uuid;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if char_length(t) < 1 or char_length(t) > 200 then return public.jerr('A to-do is 1 to 200 characters.'); end if;
  if (select count(*) from public.todos where user_id = me and created_at > now() - interval '1 minute') >= 20 then return public.jerr('Slow down and try again in a minute.'); end if;
  if (select count(*) from public.todos where user_id = me) >= 500 then return public.jerr('You can keep up to 500 to-dos.'); end if;
  insert into public.todos(user_id, text, due_at) values (me, t, p_due) returning id into n;
  return public.jok(jsonb_build_object('id', n));
end $$;
create or replace function public.update_todo(p_id uuid, p_text text default null, p_done boolean default null, p_due timestamptz default null, p_clear_due boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(p_text);
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if p_text is not null and (char_length(t) < 1 or char_length(t) > 200) then return public.jerr('A to-do is 1 to 200 characters.'); end if;
  update public.todos set text = coalesce(t, text), done = coalesce(p_done, done), due_at = case when coalesce(p_clear_due, false) then null else coalesce(p_due, due_at) end where id = p_id and user_id = me;
  if not found then return public.jerr('To-do not found.'); end if;
  return public.jok();
end $$;
create or replace function public.delete_todo(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  delete from public.todos where id = p_id and user_id = auth.uid();
  if not found then return public.jerr('To-do not found.'); end if;
  return public.jok();
end $$;

create or replace function public.list_events(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'starts_at', starts_at, 'ends_at', ends_at, 'note', note) order by starts_at), '[]'::jsonb) into r
    from (select * from public.events where user_id = me and starts_at >= p_from and starts_at < p_to order by starts_at limit 300) e;
  return public.jok(r);
end $$;
create or replace function public.add_event(p_title text, p_starts timestamptz, p_ends timestamptz default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_title, '')); nt text := nullif(btrim(coalesce(p_note, '')), ''); n uuid;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if char_length(t) < 1 or char_length(t) > 100 then return public.jerr('A title is 1 to 100 characters.'); end if;
  if p_starts is null then return public.jerr('Choose a start time.'); end if;
  if p_ends is not null and p_ends < p_starts then return public.jerr('The end must be after the start.'); end if;
  if nt is not null and char_length(nt) > 500 then return public.jerr('The note is too long.'); end if;
  if (select count(*) from public.events where user_id = me and created_at > now() - interval '1 minute') >= 20 then return public.jerr('Slow down and try again in a minute.'); end if;
  if (select count(*) from public.events where user_id = me) >= 1000 then return public.jerr('You can keep up to 1000 events.'); end if;
  insert into public.events(user_id, title, starts_at, ends_at, note) values (me, t, p_starts, p_ends, nt) returning id into n;
  return public.jok(jsonb_build_object('id', n));
end $$;
create or replace function public.update_event(p_id uuid, p_title text, p_starts timestamptz, p_ends timestamptz default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_title, '')); nt text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if char_length(t) < 1 or char_length(t) > 100 then return public.jerr('A title is 1 to 100 characters.'); end if;
  if p_starts is null then return public.jerr('Choose a start time.'); end if;
  if p_ends is not null and p_ends < p_starts then return public.jerr('The end must be after the start.'); end if;
  if nt is not null and char_length(nt) > 500 then return public.jerr('The note is too long.'); end if;
  update public.events set title = t, starts_at = p_starts, ends_at = p_ends, note = nt where id = p_id and user_id = me;
  if not found then return public.jerr('Event not found.'); end if;
  return public.jok();
end $$;
create or replace function public.delete_event(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  delete from public.events where id = p_id and user_id = auth.uid();
  if not found then return public.jerr('Event not found.'); end if;
  return public.jok();
end $$;

create or replace function public.list_notes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'preview', left(body, 120), 'updated_at', updated_at) order by updated_at desc), '[]'::jsonb) into r from public.notes where user_id = me;
  return public.jok(r);
end $$;
create or replace function public.get_note(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); n public.notes;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into n from public.notes where id = p_id and user_id = me;
  if n.id is null then return public.jerr('Note not found.'); end if;
  return public.jok(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'updated_at', n.updated_at));
end $$;
create or replace function public.add_note(p_title text default '', p_body text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_title, '')); b text := coalesce(p_body, ''); n uuid;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if char_length(t) > 100 then return public.jerr('A title is up to 100 characters.'); end if;
  if char_length(b) > 5000 then return public.jerr('A note is up to 5000 characters.'); end if;
  if (select count(*) from public.notes where user_id = me and created_at > now() - interval '1 minute') >= 10 then return public.jerr('Slow down and try again in a minute.'); end if;
  if (select count(*) from public.notes where user_id = me) >= 200 then return public.jerr('You can keep up to 200 notes.'); end if;
  insert into public.notes(user_id, title, body) values (me, t, b) returning id into n;
  return public.jok(jsonb_build_object('id', n));
end $$;
create or replace function public.update_note(p_id uuid, p_title text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_title, '')); b text := coalesce(p_body, '');
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if char_length(t) > 100 then return public.jerr('A title is up to 100 characters.'); end if;
  if char_length(b) > 5000 then return public.jerr('A note is up to 5000 characters.'); end if;
  update public.notes set title = t, body = b, updated_at = now() where id = p_id and user_id = me;
  if not found then return public.jerr('Note not found.'); end if;
  return public.jok(jsonb_build_object('updated_at', now()));
end $$;
create or replace function public.delete_note(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  delete from public.notes where id = p_id and user_id = auth.uid();
  if not found then return public.jerr('Note not found.'); end if;
  return public.jok();
end $$;

revoke all on function public.list_todos(), public.add_todo(text, timestamptz), public.update_todo(uuid, text, boolean, timestamptz, boolean), public.delete_todo(uuid),
  public.list_events(timestamptz, timestamptz), public.add_event(text, timestamptz, timestamptz, text), public.update_event(uuid, text, timestamptz, timestamptz, text), public.delete_event(uuid),
  public.list_notes(), public.get_note(uuid), public.add_note(text, text), public.update_note(uuid, text, text), public.delete_note(uuid) from public, anon, authenticated;
grant execute on function public.list_todos(), public.add_todo(text, timestamptz), public.update_todo(uuid, text, boolean, timestamptz, boolean), public.delete_todo(uuid),
  public.list_events(timestamptz, timestamptz), public.add_event(text, timestamptz, timestamptz, text), public.update_event(uuid, text, timestamptz, timestamptz, text), public.delete_event(uuid),
  public.list_notes(), public.get_note(uuid), public.add_note(text, text), public.update_note(uuid, text, text), public.delete_note(uuid) to authenticated;

select jsonb_build_object(
  'rls', (select string_agg(relname || ':' || relrowsecurity::int::text, ' ' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ('todos', 'events', 'notes')),
  'sel', (select string_agg(relname || ':' || has_table_privilege('authenticated', oid, 'select')::int::text, ' ' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ('todos', 'events', 'notes')),
  'fn_new', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', oid, 'execute') and proname in ('list_todos', 'add_todo', 'update_todo', 'delete_todo', 'list_events', 'add_event', 'update_event', 'delete_event', 'list_notes', 'get_note', 'add_note', 'update_note', 'delete_note')),
  'checks', (select count(*) from pg_constraint where contype = 'c' and conrelid in ('public.todos'::regclass, 'public.events'::regclass, 'public.notes'::regclass)),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute'))
) as verify;
