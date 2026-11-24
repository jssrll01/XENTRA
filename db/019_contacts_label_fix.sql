begin;
do $$
declare o oid; n int; def text; d2 text;
begin
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_contacts_raw';
  if n <> 1 then raise exception 'list_contacts_raw has % overloads', n; end if;
  select oid into o from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_contacts_raw';
  def := pg_get_functiondef(o);
  d2 := regexp_replace(def, '\s*left\s+join\s+public\.contact_labels\s+l\s+on\s+l\.id\s*=\s*c\.label_id', '', 'gi');
  d2 := regexp_replace(d2, '''label_id'',\s*c\.label_id,\s*''label'',\s*l\.name,\s*', '', 'g');
  if d2 = def or d2 ~* 'c\.label_id' or d2 ~* '\ml\.[a-z_]+' then
    raise exception 'list_contacts_raw not patched: %', (select string_agg(btrim(x), ' | ') from unnest(string_to_array(def, E'\n')) x where x ~* 'label|contact_labels');
  end if;
  execute d2;
end $$;
commit;
do $$
declare u uuid; r jsonb;
begin
  select id into u from auth.users order by created_at limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
  r := public.list_contacts_raw();
  perform set_config('xentra.t', coalesce(r::text, 'null'), false);
end $$;
select jsonb_build_object('left_c_label_id', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_contacts_raw' and prosrc ~* 'c\.label_id'), 'test', left(current_setting('xentra.t', true), 120)) as verify;
