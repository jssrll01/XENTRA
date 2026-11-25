create or replace function public.get_chat_head(p_cid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.conversations; p public.profiles; r text; cnt int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select role into r from public.conversation_members where conversation_id = p_cid and user_id = me;
  select * into c from public.conversations where id = p_cid;
  if c.id is null or not exists (select 1 from public.conversation_members where conversation_id = p_cid and user_id = me) then
    return jsonb_build_object('ok', false, 'error', 'Conversation not found.');
  end if;
  if c.kind = 'group' then
    select count(*) into cnt from public.conversation_members where conversation_id = p_cid;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', c.id, 'username', 'group', 'first_name', c.name, 'last_name', '',
      'avatar_url', c.avatar_url, 'is_group', true, 'announcement_only', c.announcement_only, 'my_role', r, 'members', cnt));
  end if;
  if c.kind = 'direct' then
    select pr.* into p from public.conversation_members m join public.profiles pr on pr.id = m.user_id where m.conversation_id = p_cid and m.user_id <> me limit 1;
    if p.id is null then return jsonb_build_object('ok', false, 'error', 'Conversation not found.'); end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url));
  end if;
  return jsonb_build_object('ok', false, 'error', 'Conversation not found.');
end $$;
revoke all on function public.get_chat_head(uuid) from public, anon, authenticated;
grant execute on function public.get_chat_head(uuid) to authenticated;
select jsonb_build_object(
  'fn', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_chat_head' and has_function_privilege('authenticated', oid, 'execute')),
  'fn_anon', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prokind = 'f' and has_function_privilege('anon', oid, 'execute'))
) as verify;
