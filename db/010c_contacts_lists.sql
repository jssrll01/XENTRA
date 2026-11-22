create or replace function public.create_label(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); lid uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if char_length(n) < 1 or char_length(n) > 24 then return jsonb_build_object('ok', false, 'error', 'Label names are 1 to 24 characters.'); end if;
  if (select count(*) from public.contact_labels where owner = me) >= 20 then return jsonb_build_object('ok', false, 'error', 'You can have up to 20 labels.'); end if;
  insert into public.contact_labels(owner, name) values (me, n) returning id into lid;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', lid, 'name', n));
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'You already have a label with that name.');
end $$;
create or replace function public.rename_label(p_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, ''));
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if char_length(n) < 1 or char_length(n) > 24 then return jsonb_build_object('ok', false, 'error', 'Label names are 1 to 24 characters.'); end if;
  update public.contact_labels set name = n where id = p_id and owner = me;
  if not found then return jsonb_build_object('ok', false, 'error', 'Label not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'You already have a label with that name.');
end $$;
create or replace function public.delete_label(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  delete from public.contact_labels where id = p_id and owner = me;
  if not found then return jsonb_build_object('ok', false, 'error', 'Label not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.set_contact_label(p_user uuid, p_label uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_label is not null and not exists (select 1 from public.contact_labels where id = p_label and owner = me) then return jsonb_build_object('ok', false, 'error', 'Label not found.'); end if;
  update public.contacts set label_id = p_label where owner = me and contact = p_user;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contact not found.'); end if;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.list_labels() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'count', (select count(*) from public.contacts c where c.owner = me and c.label_id = l.id)) order by lower(l.name)), '[]'::jsonb) into r
    from public.contact_labels l where l.owner = me;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
create or replace function public.block_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_user is null or p_user = me then return jsonb_build_object('ok', false, 'error', 'Choose another person.'); end if;
  if not exists (select 1 from public.profiles where id = p_user) then return jsonb_build_object('ok', false, 'error', 'Person not found.'); end if;
  insert into public.blocks(blocker, blocked) values (me, p_user) on conflict do nothing;
  delete from public.contacts where (owner = me and contact = p_user) or (owner = p_user and contact = me);
  update public.contact_requests set status = 'cancelled', responded_at = now() where status = 'pending' and ((from_user = me and to_user = p_user) or (from_user = p_user and to_user = me));
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.unblock_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  delete from public.blocks where blocker = me and blocked = p_user;
  return jsonb_build_object('ok', true, 'data', '{}'::jsonb);
end $$;
create or replace function public.list_blocks() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url, 'blocked_at', b.created_at) order by b.created_at desc), '[]'::jsonb) into r
    from public.blocks b join public.profiles p on p.id = b.blocked where b.blocker = me;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
create or replace function public.list_contacts() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(t.j order by t.fav desc, t.nm), '[]'::jsonb) into r from (
    select c.favorite as fav, lower(coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), p.username, '')) as nm,
      jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url,
        'favorite', c.favorite, 'label_id', c.label_id, 'label', l.name, 'since', c.created_at, 'mutual', public.mutual_count(me, p.id)) as j
    from public.contacts c join public.profiles p on p.id = c.contact left join public.contact_labels l on l.id = c.label_id
    where c.owner = me) t;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
create or replace function public.list_requests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i jsonb; o jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at, 'mutual', public.mutual_count(me, p.id),
      'user', jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url)) order by r.created_at desc), '[]'::jsonb) into i
    from public.contact_requests r join public.profiles p on p.id = r.from_user where r.to_user = me and r.status = 'pending';
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at, 'mutual', public.mutual_count(me, p.id),
      'user', jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url)) order by r.created_at desc), '[]'::jsonb) into o
    from public.contact_requests r join public.profiles p on p.id = r.to_user where r.from_user = me and r.status = 'pending';
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('incoming', i, 'outgoing', o));
end $$;
create or replace function public.contact_relations(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  select coalesce(jsonb_object_agg(i::text, public.relation_of(i)), '{}'::jsonb) into r from unnest(coalesce(p_ids, '{}'::uuid[])) as i;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
create or replace function public.mutual_contacts(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Not signed in.'); end if;
  if p_user is null or p_user = me or public.relation_of(p_user) is null then return jsonb_build_object('ok', false, 'error', 'Not available.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name, 'avatar_url', p.avatar_url) order by lower(p.username)), '[]'::jsonb) into r
    from public.contacts x join public.contacts y on y.contact = x.contact join public.profiles p on p.id = x.contact where x.owner = me and y.owner = p_user;
  return jsonb_build_object('ok', true, 'data', r);
end $$;
revoke all on function public.create_label(text), public.rename_label(uuid, text), public.delete_label(uuid), public.set_contact_label(uuid, uuid), public.list_labels(),
  public.block_user(uuid), public.unblock_user(uuid), public.list_blocks(), public.list_contacts(), public.list_requests(), public.contact_relations(uuid[]), public.mutual_contacts(uuid) from public, anon, authenticated;
grant execute on function public.create_label(text), public.rename_label(uuid, text), public.delete_label(uuid), public.set_contact_label(uuid, uuid), public.list_labels(),
  public.block_user(uuid), public.unblock_user(uuid), public.list_blocks(), public.list_contacts(), public.list_requests(), public.contact_relations(uuid[]), public.mutual_contacts(uuid) to authenticated;
