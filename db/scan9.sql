select jsonb_build_object(
  'fns', (select string_agg(proname || ': ' || substr(prosrc, greatest(position('active' in lower(prosrc)) - 250, 1), 700), E'\n---\n') from pg_proc where pronamespace = 'public'::regnamespace and proname like 'home_summary%' and lower(prosrc) like '%active%'),
  'convs', (select string_agg(kind || ':' || coalesce(archived::text, ''), ',') from public.conversations c join public.conversation_members m on m.conversation_id = c.id where m.user_id = auth.uid() or true)
) as scan;
