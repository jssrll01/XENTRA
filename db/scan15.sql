select jsonb_build_object(
  'expire_chat_files', (select left(prosrc, 900) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'expire_chat_files' limit 1),
  'purge_queued_files', (select left(prosrc, 900) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'purge_queued_files' limit 1)
) as scan;
