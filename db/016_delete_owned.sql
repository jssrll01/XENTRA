create or replace function public.delete_org(p_org uuid, p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o public.organizations%rowtype;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into o from public.organizations where id = p_org for update;
  if not found then return public.call_err('Organization not found.'); end if;
  if not exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = me and m.role = 'owner') then
    return public.call_err('Only the owner can delete this organization.');
  end if;
  if btrim(coalesce(p_confirm, '')) <> o.name then return public.call_err('Type the exact name to confirm.'); end if;
  delete from public.organizations where id = p_org;
  return public.call_ok(jsonb_build_object('id', p_org));
end $$;

create or replace function public.delete_team(p_team uuid, p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.teams%rowtype; cids uuid[];
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into t from public.teams where id = p_team for update;
  if not found then return public.call_err('Team not found.'); end if;
  if not exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = me and m.role = 'owner') then
    return public.call_err('Only the owner can delete this team.');
  end if;
  if btrim(coalesce(p_confirm, '')) <> t.name then return public.call_err('Type the exact name to confirm.'); end if;
  select coalesce(array_agg(conversation_id), '{}') into cids from public.team_channels where team_id = p_team;
  delete from public.conversations where id = any(cids);
  delete from public.teams where id = p_team;
  return public.call_ok(jsonb_build_object('id', p_team));
end $$;

create or replace function public.delete_group(p_conversation uuid, p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.conversations%rowtype; mids uuid[]; expect text;
begin
  if me is null then return public.call_err('Not signed in.'); end if;
  select * into c from public.conversations where id = p_conversation for update;
  if not found or c.kind <> 'group' then return public.call_err('Group not found.'); end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = me and m.role = 'owner') then
    return public.call_err('Only the owner can delete this group.');
  end if;
  expect := coalesce(nullif(btrim(c.name), ''), 'group');
  if btrim(coalesce(p_confirm, '')) <> expect then return public.call_err('Type the exact name to confirm.'); end if;
  select coalesce(array_agg(id), '{}') into mids from public.meetings where conversation_id = p_conversation;
  delete from public.call_logs where meeting_id = any(mids);
  delete from public.meeting_chat_messages where meeting_id = any(mids);
  delete from public.meeting_links where meeting_id = any(mids);
  delete from public.meeting_events where meeting_id = any(mids);
  delete from public.meeting_participants where meeting_id = any(mids);
  delete from public.meetings where id = any(mids);
  delete from public.conversations where id = p_conversation;
  return public.call_ok(jsonb_build_object('id', p_conversation));
end $$;

revoke all on function public.delete_org(uuid, text) from public, anon;
revoke all on function public.delete_team(uuid, text) from public, anon;
revoke all on function public.delete_group(uuid, text) from public, anon;
grant execute on function public.delete_org(uuid, text) to authenticated;
grant execute on function public.delete_team(uuid, text) to authenticated;
grant execute on function public.delete_group(uuid, text) to authenticated;

select jsonb_build_object(
  'fn_anon', (has_function_privilege('anon', 'public.delete_org(uuid,text)', 'execute') or has_function_privilege('anon', 'public.delete_team(uuid,text)', 'execute') or has_function_privilege('anon', 'public.delete_group(uuid,text)', 'execute')),
  'fn_auth', (has_function_privilege('authenticated', 'public.delete_org(uuid,text)', 'execute') and has_function_privilege('authenticated', 'public.delete_team(uuid,text)', 'execute') and has_function_privilege('authenticated', 'public.delete_group(uuid,text)', 'execute')),
  'mp_cols', (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'meeting_id' and table_name in ('call_logs', 'meeting_chat_messages', 'meeting_links', 'meeting_events', 'meeting_participants')),
  'tm_cols', (select string_agg(column_name, ',') from information_schema.columns where table_schema = 'public' and table_name = 'team_members' and column_name in ('team_id', 'user_id', 'role'))
);
