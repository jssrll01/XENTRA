create or replace function public.create_channel(p_team uuid, p_name text, p_mods_only boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); cid uuid;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_team, me)) < 2 then return public.jerr('Only admins can create channels.'); end if;
  if char_length(n) < 1 or char_length(n) > 40 then return public.jerr('Channel names are 1 to 40 characters.'); end if;
  if (select count(*) from public.team_channels where team_id = p_team) >= 30 then return public.jerr('A team can have up to 30 channels.'); end if;
  insert into public.conversations(kind) values ('channel') returning id into cid;
  insert into public.team_channels(conversation_id, team_id, name, mods_only) values (cid, p_team, n, coalesce(p_mods_only, false));
  insert into public.conversation_members(conversation_id, user_id) select cid, user_id from public.team_members where team_id = p_team;
  perform public.log_team(p_team, me, 'channel', 'created #' || n);
  return public.jok(jsonb_build_object('id', cid));
exception when unique_violation then
  return public.jerr('A channel with that name already exists.');
end $$;
create or replace function public.update_channel(p_cid uuid, p_name text default null, p_mods_only boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid; n text := btrim(p_name);
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select team_id into t from public.team_channels where conversation_id = p_cid;
  if t is null then return public.jerr('Channel not found.'); end if;
  if public.team_rank(public.team_role(t, me)) < 2 then return public.jerr('Only admins can change channels.'); end if;
  if n is not null and (char_length(n) < 1 or char_length(n) > 40) then return public.jerr('Channel names are 1 to 40 characters.'); end if;
  update public.team_channels set name = coalesce(n, name), mods_only = coalesce(p_mods_only, mods_only) where conversation_id = p_cid;
  return public.jok();
exception when unique_violation then
  return public.jerr('A channel with that name already exists.');
end $$;
create or replace function public.archive_channel(p_cid uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid; n text;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select team_id, name into t, n from public.team_channels where conversation_id = p_cid;
  if t is null then return public.jerr('Channel not found.'); end if;
  if public.team_rank(public.team_role(t, me)) < 2 then return public.jerr('Only admins can change channels.'); end if;
  update public.team_channels set archived = coalesce(p_on, false) where conversation_id = p_cid;
  perform public.log_team(t, me, 'channel', case when coalesce(p_on, false) then 'archived #' else 'restored #' end || n);
  return public.jok();
end $$;
create or replace function public.list_channels(p_team uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_role(p_team, me) is null then return public.jerr('Team not found.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.conversation_id, 'name', c.name, 'mods_only', c.mods_only, 'archived', c.archived,
      'unread', (select count(*) from public.messages m join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = me
                 where m.conversation_id = c.conversation_id and m.sender_id <> me and m.deleted_at is null and m.thread_root is null and m.created_at > cm.last_read_at))
    order by c.archived, c.created_at), '[]'::jsonb) into r from public.team_channels c where c.team_id = p_team;
  return public.jok(r);
end $$;
create or replace function public.get_channel_head(p_cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.team_channels; t public.teams;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into c from public.team_channels where conversation_id = p_cid;
  if c.conversation_id is null or not public.is_member(p_cid) then return public.jerr('Conversation not found.'); end if;
  select * into t from public.teams where id = c.team_id;
  return public.jok(jsonb_build_object('id', p_cid, 'username', 'channel', 'first_name', '#' || c.name, 'last_name', '', 'avatar_url', t.avatar_url,
    'is_channel', true, 'team_id', t.id, 'team_name', t.name));
end $$;
create or replace function public.conversation_names(p_cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  if not public.is_member(p_cid) then return public.jerr('Conversation not found.'); end if;
  select coalesce(jsonb_object_agg(m.user_id::text, public.disp(m.user_id)), '{}'::jsonb) into r from public.conversation_members m where m.conversation_id = p_cid;
  return public.jok(r);
end $$;
create or replace function public.create_post(p_team uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); id uuid;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_rank(public.team_role(p_team, me)) < 1 then return public.jerr('Only moderators can post here.'); end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = me and muted) then return public.jerr('You are muted in this team.'); end if;
  if char_length(b) < 1 or char_length(b) > 2000 then return public.jerr('Posts are 1 to 2000 characters.'); end if;
  insert into public.team_posts(team_id, author, body) values (p_team, me, b) returning team_posts.id into id;
  perform public.log_team(p_team, me, 'post', 'shared a post');
  return public.jok(jsonb_build_object('id', id));
end $$;
create or replace function public.pin_post(p_id uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select team_id into t from public.team_posts where id = p_id;
  if t is null then return public.jerr('Post not found.'); end if;
  if public.team_rank(public.team_role(t, me)) < 1 then return public.jerr('Only moderators can pin posts.'); end if;
  update public.team_posts set pinned = coalesce(p_on, false) where id = p_id;
  return public.jok();
end $$;
create or replace function public.delete_post(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.team_posts;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  select * into p from public.team_posts where id = p_id;
  if p.id is null then return public.jerr('Post not found.'); end if;
  if not (p.author = me or public.team_rank(public.team_role(p.team_id, me)) >= 1) then return public.jerr('You cannot delete this post.'); end if;
  delete from public.team_posts where id = p_id;
  return public.jok();
end $$;
create or replace function public.list_posts(p_team uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_role(p_team, me) is null then return public.jerr('Team not found.'); end if;
  select coalesce(jsonb_agg(x.j order by x.pinned desc, x.created_at desc), '[]'::jsonb) into r from (
    select p.pinned, p.created_at, jsonb_build_object('id', p.id, 'body', p.body, 'pinned', p.pinned, 'created_at', p.created_at, 'author', p.author, 'author_name', public.disp(p.author)) as j
    from public.team_posts p where p.team_id = p_team order by p.pinned desc, p.created_at desc limit 50) x;
  return public.jok(r);
end $$;
create or replace function public.list_team_activity(p_team uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return public.jerr('Not signed in.'); end if;
  if public.team_role(p_team, me) is null then return public.jerr('Team not found.'); end if;
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into r from (
    select a.created_at, jsonb_build_object('id', a.id, 'type', a.type, 'text', a.text, 'created_at', a.created_at, 'actor_name', public.disp(a.actor)) as j
    from public.team_activity a where a.team_id = p_team order by a.created_at desc limit 50) x;
  return public.jok(r);
end $$;
create or replace function public.get_announcement() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.announcements;
begin
  if auth.uid() is null then return public.jerr('Not signed in.'); end if;
  select * into a from public.announcements where active order by created_at desc limit 1;
  if a.id is null then return public.jok('null'::jsonb); end if;
  return public.jok(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body));
end $$;
revoke all on function public.create_channel(uuid, text, boolean), public.update_channel(uuid, text, boolean), public.archive_channel(uuid, boolean), public.list_channels(uuid),
  public.get_channel_head(uuid), public.conversation_names(uuid), public.create_post(uuid, text), public.pin_post(uuid, boolean), public.delete_post(uuid),
  public.list_posts(uuid), public.list_team_activity(uuid), public.get_announcement() from public, anon, authenticated;
grant execute on function public.create_channel(uuid, text, boolean), public.update_channel(uuid, text, boolean), public.archive_channel(uuid, boolean), public.list_channels(uuid),
  public.get_channel_head(uuid), public.conversation_names(uuid), public.create_post(uuid, text), public.pin_post(uuid, boolean), public.delete_post(uuid),
  public.list_posts(uuid), public.list_team_activity(uuid), public.get_announcement() to authenticated;
