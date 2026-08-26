-- REVOKE ALL ... FROM public in 20260830000000 also removed the implicit
-- EXECUTE that service_role was relying on, so create-web-order could not call
-- claim_checkout_attempt at all and every checkout returned 500.
--
-- The intent was to keep these off anon/authenticated, not off the server.
-- Grant them explicitly to service_role so the boundary is stated rather than
-- inherited, and anon/authenticated remain excluded.
GRANT EXECUTE ON FUNCTION public.claim_checkout_attempt(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_checkout_attempt(uuid,text,text,uuid,text,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_checkout_attempt(uuid, text) TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc,
           has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('claim_checkout_attempt','complete_checkout_attempt','fail_checkout_attempt')
  LOOP
    RAISE NOTICE 'PROBE: % service_role=% anon=%', r.proname, r.svc, r.anon;
  END LOOP;
END $$;
