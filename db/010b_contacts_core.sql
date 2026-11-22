create or replace function public.disp(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(btrim(first_name || ' ' || last_name), ''), username) from public.profiles where id = p_id), 'Someone')
$$;
create or replace function public.pair_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
create or replace function public.block_between(p_cid uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.conversation_members where conversation_id = p_cid) = 2
    and exists (select 1 from public.conversation_members m where m.conversation_id = p_cid and m.user_id <> p_user and public.pair_blocked(p_user, m.user_id))
$$;
create or replace function public.block_error(p_cid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid;
begin
  if me is null or not public.block_between(p_cid, me) then return null; end if;
  select m.user_id into o from public.conversation_members m where m.conversation_id = p_cid and m.user_id <> me limit 1;
  if exists (select 1 from public.blocks where blocker = me and blocked = o) then return 'You blocked this person. Unblock them to send messages.'; end if;
  return 'You cannot send messages to this person.';
end $$;
create or replace function public.relation_of(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return null; end if;
  if exists (select 1 from public.blocks where blocker = me and blocked = p_user) then return 'blocked'; end if;
  if exists (select 1 from public.contacts where owner = me and contact = p_user) then return 'contact'; end if;
  if exists (select 1 from public.contact_requests where from_user = p_user and to_user = me and status = 'pending') then return 'incoming'; end if;
  if exists (select 1 from public.contact_requests where from_user = me and to_user = p_user and status = 'pending') then return 'outgoing'; end if;
  return null;
end $$;
create or replace function public.mutual_count(a uuid, b uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.contacts x join public.contacts y on y.contact = x.contact where x.owner = a and y.owner = b
$$;
create or replace function public.get_my_code() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  insert into public.contact_codes(user_id, code) values (me, substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)) on conflict (user_id) do nothing;
  select code into c from public.contact_codes where user_id = me;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('code', c));
end $$;
create or replace function public.regenerate_my_code() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  insert into public.contact_codes(user_id, code) values (me, substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    on conflict (user_id) do update set code = excluded.code, created_at = now() returning code into c;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('code', c));
end $$;
create or replace function public.lookup_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u uuid; p public.profiles; rel text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select user_id into u from public.contact_codes where code = lower(btrim(coalesce(p_code, '')));
  if u is null or exists (select 1 from public.blocks where blocker = u and blocked = me) then
    return jsonb_build_object('ok', false, 'error', 'This code is not valid.');
  end if;
  select * into p from public.profiles where id = u;
  rel := case when u = me then 'self' else public.relation_of(u) end;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url, 'relation', rel));
end $$;
create or replace function public.respond_contact_request(p_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.contact_requests;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select * into r from public.contact_requests where id = p_id and to_user = me and status = 'pending' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Request not found.'); end if;
  if not coalesce(p_accept, false) then
    update public.contact_requests set status = 'declined', responded_at = now() where id = p_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('status', 'declined'));
  end if;
  if public.pair_blocked(me, r.from_user) then return jsonb_build_object('ok', false, 'error', 'This request is no longer available.'); end if;
  update public.contact_requests set status = 'accepted', responded_at = now() where id = p_id;
  insert into public.contacts(owner, contact) values (me, r.from_user), (r.from_user, me) on conflict do nothing;
  insert into public.notifications(user_id, type, title, body, link)
    values (r.from_user, 'contact_accepted', 'Request accepted', public.disp(me) || ' accepted your contact request.', '/contacts');
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('status', 'accepted'));
end $$;
create or replace function public.send_contact_request(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inc public.contact_requests; rid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_user is null or p_user = me then return jsonb_build_object('ok', false, 'error', 'Choose another person.'); end if;
  if not exists (select 1 from public.profiles where id = p_user) then return jsonb_build_object('ok', false, 'error', 'Person not found.'); end if;
  if public.pair_blocked(me, p_user) then return jsonb_build_object('ok', false, 'error', 'You cannot send a request to this person.'); end if;
  if exists (select 1 from public.contacts where owner = me and contact = p_user) then return jsonb_build_object('ok', false, 'error', 'You are already contacts.'); end if;
  select * into inc from public.contact_requests where from_user = p_user and to_user = me and status = 'pending';
  if found then return public.respond_contact_request(inc.id, true); end if;
  if exists (select 1 from public.contact_requests where from_user = me and to_user = p_user and status = 'pending') then return jsonb_build_object('ok', false, 'error', 'Request already sent.'); end if;
  if (select count(*) from public.contact_requests where from_user = me and status = 'pending') >= 50 then return jsonb_build_object('ok', false, 'error', 'You have too many pending requests.'); end if;
  insert into public.contact_requests(from_user, to_user) values (me, p_user) returning id into rid;
  insert into public.notifications(user_id, type, title, body, link)
    values (p_user, 'contact_request', 'New contact request', public.disp(me) || ' wants to connect with you.', '/contacts');
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', rid, 'status', 'pending'));
end $$;
create or replace function public.cancel_contact_request(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.contact_requests set status = 'cancelled', responded_at = now() where id = p_id and from_user = me and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'Request not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.remove_contact(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  delete from public.contacts where (owner = me and contact = p_user) or (owner = p_user and contact = me);
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.set_favorite(p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  update public.contacts set favorite = coalesce(p_on, false) where owner = me and contact = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contact not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
revoke all on function public.disp(uuid), public.pair_blocked(uuid, uuid), public.block_between(uuid, uuid), public.block_error(uuid), public.relation_of(uuid), public.mutual_count(uuid, uuid),
  public.get_my_code(), public.regenerate_my_code(), public.lookup_code(text), public.respond_contact_request(uuid, boolean), public.send_contact_request(uuid),
  public.cancel_contact_request(uuid), public.remove_contact(uuid), public.set_favorite(uuid, boolean) from public, anon, authenticated;
grant execute on function public.get_my_code(), public.regenerate_my_code(), public.lookup_code(text), public.respond_contact_request(uuid, boolean), public.send_contact_request(uuid),
  public.cancel_contact_request(uuid), public.remove_contact(uuid), public.set_favorite(uuid, boolean) to authenticated;
