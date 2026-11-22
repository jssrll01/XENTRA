begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_fmt check (username is null or username ~ '^[a-z0-9_]{3,20}$')
);
create unique index profiles_username_key on public.profiles (lower(username));

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.notifications enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());

revoke all on public.profiles, public.notifications from anon, authenticated;
grant select (id, username, first_name, last_name, avatar_url, created_at) on public.profiles to authenticated;
grant select on public.notifications to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); u text;
begin
  u := lower(nullif(trim(m->>'username'), ''));
  if u is not null and (u !~ '^[a-z0-9_]{3,20}$' or exists (select 1 from public.profiles where lower(username) = u)) then u := null; end if;
  insert into public.profiles (id, username, first_name, last_name, phone, avatar_url)
  values (new.id, u, coalesce(trim(m->>'first_name'), ''), coalesce(trim(m->>'last_name'), ''), nullif(trim(m->>'phone'), ''), nullif(m->>'avatar_url', ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, username, first_name, last_name, phone, avatar_url)
select u.id,
  case when lower(u.raw_user_meta_data->>'username') ~ '^[a-z0-9_]{3,20}$' then lower(u.raw_user_meta_data->>'username') end,
  coalesce(trim(u.raw_user_meta_data->>'first_name'), ''), coalesce(trim(u.raw_user_meta_data->>'last_name'), ''),
  nullif(trim(u.raw_user_meta_data->>'phone'), ''), nullif(u.raw_user_meta_data->>'avatar_url', '')
from auth.users u on conflict (id) do nothing;

create or replace function public.get_my_profile() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select jsonb_build_object('id', id, 'username', username, 'first_name', first_name, 'last_name', last_name, 'phone', phone, 'avatar_url', avatar_url)
    into r from public.profiles where id = auth.uid();
  if r is null then return jsonb_build_object('ok', false, 'error', 'Profile not found.'); end if;
  return jsonb_build_object('ok', true, 'data', r);
end $$;

create or replace function public.update_profile(p_first text, p_last text, p_username text, p_phone text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f text := trim(coalesce(p_first, '')); l text := trim(coalesce(p_last, ''));
        u text := lower(trim(coalesce(p_username, ''))); ph text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if f = '' or length(f) > 50 or length(l) > 50 then return jsonb_build_object('ok', false, 'error', 'Enter a valid first and last name.'); end if;
  if u !~ '^[a-z0-9_]{3,20}$' then return jsonb_build_object('ok', false, 'error', 'Username must be 3 to 20 letters, numbers or underscores.'); end if;
  if exists (select 1 from public.profiles where lower(username) = u and id <> auth.uid()) then return jsonb_build_object('ok', false, 'error', 'That username is taken.'); end if;
  if ph is not null and ph !~ '^\+?[0-9 ()-]{6,20}$' then return jsonb_build_object('ok', false, 'error', 'Enter a valid phone number.'); end if;
  update public.profiles set first_name = f, last_name = l, username = u, phone = ph, updated_at = now() where id = auth.uid();
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'That username is taken.');
end $$;

create or replace function public.set_avatar(p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_url is not null and p_url !~ '^https://res\.cloudinary\.com/bvw3okdf/' then return jsonb_build_object('ok', false, 'error', 'Invalid image address.'); end if;
  update public.profiles set avatar_url = p_url, updated_at = now() where id = auth.uid();
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

create or replace function public.home_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare z jsonb := jsonb_build_object('value', 0, 'series', to_jsonb(array_fill(0, array[7])));
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'unread', z, 'active', z, 'invites', z, 'scheduled', z,
    'notifications', (select count(*) from public.notifications where user_id = auth.uid() and read_at is null)));
end $$;

create or replace function public.list_notifications(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := least(greatest(coalesce(p_limit, 50), 1), 100); r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into r
  from (select id, type, title, body, link, read_at, created_at from public.notifications
        where user_id = auth.uid() order by created_at desc limit n) x;
  return jsonb_build_object('ok', true, 'data', r);
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;

revoke execute on function public.get_my_profile(), public.update_profile(text, text, text, text), public.set_avatar(text),
  public.home_summary(), public.list_notifications(int), public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.get_my_profile(), public.update_profile(text, text, text, text), public.set_avatar(text),
  public.home_summary(), public.list_notifications(int), public.mark_notifications_read(uuid[]) to authenticated;

commit;
select 'schema ok' as result;
