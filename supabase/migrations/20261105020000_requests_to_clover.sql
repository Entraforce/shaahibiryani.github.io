-- Catering requests and table reservations appear in Clover's open Orders.
--
-- Owner, 2026-11-05: staff should see every catering request and reservation on
-- the Clover terminal, as an open order whose title carries the event date and
-- time; no kitchen ticket; catering orders tagged with a "Catering" order type.
--
-- The clover-requests Edge Function (app repo) runs every minute, finds rows not
-- yet sent, CLAIMS each one (clover_claimed_at) before calling Clover, then stores
-- the Clover order id. A claim whose outcome is unknown (timeout, lost response)
-- is never retried automatically: it keeps clover_claimed_at with clover_error
-- set, for a person to look at. A duplicate order on the terminal is worse than a
-- late one.
--
-- The cron call presents a shared secret from Vault (clover_requests_trigger_secret)
-- that the function checks against its CLOVER_REQUESTS_TRIGGER_SECRET; without the
-- secret the function does nothing.

ALTER TABLE public.catering_inquiries
  ADD COLUMN event_time        text,
  ADD COLUMN clover_order_id   text,
  ADD COLUMN clover_claimed_at timestamptz,
  ADD COLUMN clover_error      text;

ALTER TABLE public.website_messages
  ADD COLUMN clover_order_id   text,
  ADD COLUMN clover_claimed_at timestamptz,
  ADD COLUMN clover_error      text;

CREATE INDEX catering_inquiries_clover_todo_idx ON public.catering_inquiries (created_at)
  WHERE clover_claimed_at IS NULL;
CREATE INDEX website_messages_clover_todo_idx ON public.website_messages (created_at)
  WHERE clover_claimed_at IS NULL AND kind = 'reservation';

CREATE OR REPLACE FUNCTION public.run_clover_requests()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, pg_temp
AS $$
DECLARE
  req_id bigint;
  trigger_secret text;
BEGIN
  SELECT decrypted_secret INTO trigger_secret
    FROM vault.decrypted_secrets WHERE name = 'clover_requests_trigger_secret';
  IF trigger_secret IS NULL THEN
    RETURN NULL;   -- not configured: nothing to call
  END IF;

  -- Nothing waiting: skip the HTTP call entirely.
  -- (Submissions over the per-IP email limit, notify_error = 'rate_limited', are
  -- treated as abuse and never sent to Clover either.)
  IF NOT EXISTS (SELECT 1 FROM public.catering_inquiries WHERE clover_claimed_at IS NULL
                   AND notify_error IS DISTINCT FROM 'rate_limited'
                   AND created_at > now() - interval '7 days')
     AND NOT EXISTS (SELECT 1 FROM public.website_messages WHERE clover_claimed_at IS NULL
                   AND kind = 'reservation' AND notify_error IS DISTINCT FROM 'rate_limited'
                   AND created_at > now() - interval '7 days') THEN
    RETURN NULL;
  END IF;

  -- The anon key is PUBLIC (it ships in the website's HTML); the platform only
  -- needs some valid JWT. The x-clover-trigger header is what authorises the call.
  SELECT net.http_post(
    url := 'https://wtdthjhqgsbnyjucdqxl.supabase.co/functions/v1/clover-requests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZHRoamhxZ3NibnlqdWNkcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjcxMzcsImV4cCI6MjA5MjQ0MzEzN30.1WYVcbrulkg0l7QB-scj4KcJCnMwFKSLHXucEdEZV3Q',
      'x-clover-trigger', trigger_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) INTO req_id;
  RETURN req_id;
END $$;

REVOKE ALL ON FUNCTION public.run_clover_requests() FROM public, anon, authenticated;

SELECT cron.unschedule('clover-requests')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clover-requests');
SELECT cron.schedule('clover-requests', '* * * * *', $$select public.run_clover_requests();$$);
