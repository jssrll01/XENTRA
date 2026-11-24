select jsonb_build_object(
  'head', substr((select prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname = 'home_summary_base' limit 1), 1, 1300)
) as scan;
