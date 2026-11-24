select jsonb_build_object('list_labels', (select left(prosrc, 1300) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'list_labels' limit 1)) as scan;
