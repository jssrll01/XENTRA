create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'online' check (status in ('online', 'dnd', 'invisible')),
  status_text text check (status_text is null or char_length(status_text) <= 80),
  status_expires_at timestamptz,
  last_ping timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists ps_user_idx on public.push_subscriptions(user_id);
alter table public.user_presence enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.user_presence, public.push_subscriptions from anon, authenticated;

create or replace function public.set_presence(p_status text, p_text text default null, p_expires timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tx text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if coalesce(p_status, '') not in ('online', 'dnd', 'invisible') then return public.jerr('Invalid status.'); end if;
  if tx is not null and char_length(tx) > 80 then return public.jerr('Status text is up to 80 characters.'); end if;
  if p_expires is not null and p_expires <= now() then return public.jerr('Expiry must be in the future.'); end if;
  insert into public.user_presence(user_id, status, status_text, status_expires_at, last_ping, last_seen)
    values (me, p_status, tx, case when tx is null then null else p_expires end, now(), now())
  on conflict (user_id) do update set status = excluded.status, status_text = excluded.status_text,
    status_expires_at = excluded.status_expires_at, last_ping = now(), last_seen = now();
  return public.jok();
end $$;

create or replace function public.ping_presence() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  insert into public.user_presence(user_id) values (me)
  on conflict (user_id) do update set last_ping = now(), last_seen = now();
  return public.jok();
end $$;

create or replace function public.get_my_presence() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u public.user_presence;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into u from public.user_presence where user_id = me;
  if u.user_id is null then return public.jok(jsonb_build_object('status', 'online', 'status_text', null, 'status_expires_at', null)); end if;
  return public.jok(jsonb_build_object('status', u.status,
    'status_text', case when u.status_expires_at is null or u.status_expires_at > now() then u.status_text end,
    'status_expires_at', case when u.status_expires_at > now() then u.status_expires_at end));
end $$;

create or replace function public.get_presence(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select coalesce(jsonb_object_agg(u.user_id::text, jsonb_build_object(
      'state', case when u.status = 'invisible' then 'offline' when u.last_ping > now() - interval '90 seconds' then u.status else 'offline' end,
      'last_seen', case when u.status = 'invisible' then null else u.last_seen end,
      'status_text', case when u.status_expires_at is null or u.status_expires_at > now() then u.status_text end)), '{}'::jsonb) into r
    from public.user_presence u
    where u.user_id = any(p_ids[1:200])
      and (u.user_id = me or exists (select 1 from public.conversation_members a join public.conversation_members b on b.conversation_id = a.conversation_id
            where a.user_id = me and b.user_id = u.user_id));
  return public.jok(r);
end $$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if coalesce(p_endpoint, '') = '' or left(p_endpoint, 8) <> 'https://' or char_length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return public.jerr('Invalid subscription.');
  end if;
  if (select count(*) from public.push_subscriptions where user_id = me and endpoint <> p_endpoint) >= 10 then return public.jerr('Too many devices. Remove one first.'); end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
    values (me, p_endpoint, p_p256dh, p_auth, left(p_ua, 200))
  on conflict (endpoint) do update set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
  return public.jok();
end $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
  return public.jok();
end $$;

create or replace function public.list_devices() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'user_agent', user_agent, 'created_at', created_at, 'last_used_at', last_used_at,
    'endpoint', endpoint) order by created_at desc), '[]'::jsonb) into r from public.push_subscriptions where user_id = auth.uid();
  return public.jok(r);
end $$;

create or replace function public.remove_device(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  delete from public.push_subscriptions where id = p_id and user_id = auth.uid();
  if not found then return public.jerr('Device not found.'); end if;
  return public.jok();
end $$;

-- Server only (edge function with the service role): who should get a push for a message. Skips the sender, muted chats and Do Not Disturb.
create or replace function public.push_targets(p_cid uuid, p_sender uuid) returns table(sub_id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
  from public.conversation_members m
  join public.push_subscriptions s on s.user_id = m.user_id
  left join public.user_presence u on u.user_id = m.user_id
  where m.conversation_id = p_cid and m.user_id <> p_sender and not m.muted
    and coalesce(u.status, 'online') <> 'dnd'
$$;

revoke all on function public.set_presence(text, text, timestamptz), public.ping_presence(), public.get_my_presence(), public.get_presence(uuid[]),
  public.save_push_subscription(text, text, text, text), public.remove_push_subscription(text), public.list_devices(), public.remove_device(uuid),
  public.push_targets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_presence(text, text, timestamptz), public.ping_presence(), public.get_my_presence(), public.get_presence(uuid[]),
  public.save_push_subscription(text, text, text, text), public.remove_push_subscription(text), public.list_devices(), public.remove_device(uuid) to authenticated;

select jsonb_build_object(
  'rls', (select string_agg(relname || ':' || relrowsecurity::int::text, ' ' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ('user_presence', 'push_subscriptions')),
  'sel', (select string_agg(relname || ':' || has_table_privilege('authenticated', oid, 'select')::int::text, ' ' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ('user_presence', 'push_subscriptions')),
  'fn_new', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', oid, 'execute') and proname in ('set_presence', 'ping_presence', 'get_my_presence', 'get_presence', 'save_push_subscription', 'remove_push_subscription', 'list_devices', 'remove_device')),
  'push_targets_auth', (select count(*) from pg_proc where proname = 'push_targets' and has_function_privilege('authenticated', oid, 'execute')),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute'))
) as verify;
