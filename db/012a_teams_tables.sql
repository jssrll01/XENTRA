alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('direct', 'group', 'channel'));
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  avatar_url text,
  join_mode text not null default 'open' check (join_mode in ('open', 'approval')),
  discoverable boolean not null default true,
  invite_code text unique,
  invite_enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists tm_user_idx on public.team_members(user_id);
create table if not exists public.team_bans (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists tjr_pending on public.team_join_requests(team_id, user_id) where status = 'pending';
create table if not exists public.team_channels (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  mods_only boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists tc_team_name on public.team_channels(team_id, lower(name));
create table if not exists public.team_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tp_team_idx on public.team_posts(team_id, created_at desc);
create table if not exists public.team_activity (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  actor uuid references public.profiles(id) on delete set null,
  type text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists ta_team_idx on public.team_activity(team_id, created_at desc);
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace function public.jok(d jsonb default '{}'::jsonb) returns jsonb language sql immutable as $$ select jsonb_build_object('ok', true, 'data', d) $$;
create or replace function public.jerr(t text) returns jsonb language sql immutable as $$ select jsonb_build_object('ok', false, 'error', t) $$;
create or replace function public.team_role(p_team uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$ select role from public.team_members where team_id = p_team and user_id = p_user $$;
create or replace function public.team_rank(r text) returns int language sql immutable as $$ select case r when 'owner' then 3 when 'admin' then 2 when 'moderator' then 1 else 0 end $$;
create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid()) $$;
create or replace function public.is_team_staff(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid() and role in ('owner', 'admin', 'moderator')) $$;
create or replace function public.log_team(p_team uuid, p_actor uuid, p_type text, p_text text) returns void
language sql security definer set search_path = public as $$ insert into public.team_activity(team_id, actor, type, text) values (p_team, p_actor, p_type, p_text) $$;
create or replace function public.add_to_channels(p_team uuid, p_user uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.conversation_members(conversation_id, user_id) select conversation_id, p_user from public.team_channels where team_id = p_team on conflict do nothing $$;
create or replace function public.remove_from_channels(p_team uuid, p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.conversation_members where user_id = p_user and conversation_id in (select conversation_id from public.team_channels where team_id = p_team) $$;
create or replace function public.add_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.team_members(team_id, user_id, role) values (p_team, p_user, 'member') on conflict do nothing;
  if found then
    perform public.add_to_channels(p_team, p_user);
    perform public.log_team(p_team, p_user, 'joined', 'joined the team');
  end if;
end $$;
create or replace function public.channel_block(p_cid uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_channels tc join public.team_members tm on tm.team_id = tc.team_id
    where tc.conversation_id = p_cid and tm.user_id = p_user and (tm.muted or tc.archived or (tc.mods_only and tm.role = 'member')))
$$;
create or replace function public.block_between(p_cid uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case (select kind from public.conversations where id = p_cid)
    when 'group' then exists (select 1 from public.conversations c join public.conversation_members m on m.conversation_id = c.id
              where c.id = p_cid and c.announcement_only and m.user_id = p_user and m.role = 'member')
    when 'channel' then public.channel_block(p_cid, p_user)
    else (select count(*) from public.conversation_members where conversation_id = p_cid) = 2
      and exists (select 1 from public.conversation_members m where m.conversation_id = p_cid and m.user_id <> p_user and public.pair_blocked(p_user, m.user_id))
  end
$$;
create or replace function public.block_error(p_cid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid; k text; msg text;
begin
  if me is null then return null; end if;
  select kind into k from public.conversations where id = p_cid;
  if k = 'group' then
    if public.block_between(p_cid, me) then return 'Only admins can send messages in this group.'; end if;
    return null;
  end if;
  if k = 'channel' then
    if not public.block_between(p_cid, me) then return null; end if;
    select case when tm.muted then 'You are muted in this team.' when tc.archived then 'This channel is archived.' else 'Only moderators can post in this channel.' end into msg
      from public.team_channels tc join public.team_members tm on tm.team_id = tc.team_id and tm.user_id = me where tc.conversation_id = p_cid;
    return coalesce(msg, 'You cannot post in this channel.');
  end if;
  if not public.block_between(p_cid, me) then return null; end if;
  select m.user_id into o from public.conversation_members m where m.conversation_id = p_cid and m.user_id <> me limit 1;
  if exists (select 1 from public.blocks where blocker = me and blocked = o) then return 'You blocked this person. Unblock them to send messages.'; end if;
  return 'You cannot send messages to this person.';
end $$;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_bans enable row level security;
alter table public.team_join_requests enable row level security;
alter table public.team_channels enable row level security;
alter table public.team_posts enable row level security;
alter table public.team_activity enable row level security;
alter table public.announcements enable row level security;
revoke all on public.teams, public.team_members, public.team_bans, public.team_join_requests, public.team_channels, public.team_posts, public.team_activity, public.announcements from anon, authenticated;
revoke all on function public.jok(jsonb), public.jerr(text), public.team_role(uuid, uuid), public.team_rank(text), public.log_team(uuid, uuid, text, text),
  public.add_to_channels(uuid, uuid), public.remove_from_channels(uuid, uuid), public.add_member(uuid, uuid), public.channel_block(uuid, uuid),
  public.is_team_member(uuid), public.is_team_staff(uuid) from public, anon, authenticated;
grant execute on function public.is_team_member(uuid), public.is_team_staff(uuid) to authenticated;
grant select on public.team_members, public.team_posts, public.team_join_requests to authenticated;
drop policy if exists tm_sel on public.team_members;
create policy tm_sel on public.team_members for select to authenticated using (user_id = auth.uid() or public.is_team_member(team_id));
drop policy if exists tp_sel on public.team_posts;
create policy tp_sel on public.team_posts for select to authenticated using (public.is_team_member(team_id));
drop policy if exists tjr_sel on public.team_join_requests;
create policy tjr_sel on public.team_join_requests for select to authenticated using (user_id = auth.uid() or public.is_team_staff(team_id));
