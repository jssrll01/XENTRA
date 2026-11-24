do $do$
declare d text; n1 int; n2 int; n3 int; f oid;
begin
  select p.oid into f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'list_conversations_raw';
  if f is null then raise exception 'list_conversations_raw not found'; end if;
  d := pg_get_functiondef(f);
  select count(*) into n1 from regexp_matches(d, 'case\s+when\s+c\.kind\s*=\s*''group''\s+then', 'g');
  select count(*) into n2 from regexp_matches(d, 'join\s+conversations\s+c\s+on\s+c\.id\s*=\s*cm\.conversation_id\s+left\s+join\s+lateral', 'g');
  select count(*) into n3 from regexp_matches(d, '\(c\.kind\s*=\s*''group''\s+or\s+\(d\.id\s+is\s+not\s+null', 'g');
  if n1 <> 1 or n2 <> 1 or n3 <> 1 then raise exception 'anchors found % % % (need 1 1 1), nothing changed', n1, n2, n3; end if;
  d := regexp_replace(d, 'case\s+when\s+c\.kind\s*=\s*''group''\s+then',
    'case when c.kind = ''channel'' then jsonb_build_object(''id'', c.id, ''username'', ''channel'', ''first_name'', ''#'' || tc.name, ''last_name'', '''', ''avatar_url'', tt.avatar_url, ''is_channel'', true, ''team_id'', tt.id, ''team_name'', tt.name) when c.kind = ''group'' then');
  d := regexp_replace(d, 'join\s+conversations\s+c\s+on\s+c\.id\s*=\s*cm\.conversation_id\s+left\s+join\s+lateral',
    'join conversations c on c.id = cm.conversation_id left join public.team_channels tc on tc.conversation_id = c.id left join public.teams tt on tt.id = tc.team_id left join lateral');
  d := regexp_replace(d, '\(c\.kind\s*=\s*''group''\s+or\s+\(d\.id\s+is\s+not\s+null',
    '(c.kind in (''group'', ''channel'') or (d.id is not null');
  execute d;
end $do$;

select jsonb_build_object(
 'patched', (select position('is_channel' in pg_get_functiondef(p.oid)) > 0 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'list_conversations_raw'),
 'raw_auth', has_function_privilege('authenticated', 'public.list_conversations_raw()', 'execute'),
 'raw_anon', has_function_privilege('anon', 'public.list_conversations_raw()', 'execute'),
 'wrap_auth', has_function_privilege('authenticated', 'public.list_conversations()', 'execute'),
 'wrap_anon', has_function_privilege('anon', 'public.list_conversations()', 'execute'),
 'channel_memberships', (select count(*) from conversation_members cm join conversations c on c.id = cm.conversation_id where c.kind = 'channel'),
 'pf', (select left(regexp_replace(prosrc, '\s+', ' ', 'g'), 450) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'privacy_filter' limit 1));
