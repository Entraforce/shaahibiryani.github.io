-- (Named office_alerts: public.ops_alerts already belongs to the app's invariant-check
-- alert pipeline.)
-- Log of operations alerts sent by the ops-alert Edge Function (office PC watchdog:
-- ARM, Maya, LocalLens, tunnels, sync, disk, memory). One row per alert actually
-- delivered or suppressed, so a burst can be capped and history inspected.
-- Only the service role reads or writes it.

CREATE TABLE public.office_alerts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL,                 -- e.g. office-pc
  check_name  text NOT NULL,                 -- e.g. arm-web, maya, disk-c
  severity    text NOT NULL CHECK (severity IN ('critical','warning','info')),
  state       text NOT NULL CHECK (state IN ('down','up','reminder')),
  message     text,
  pushed      boolean NOT NULL DEFAULT false,
  emailed     boolean NOT NULL DEFAULT false,
  suppressed  text                           -- why nothing was sent (rate cap), if so
);

CREATE INDEX office_alerts_created_idx ON public.office_alerts (created_at DESC);

ALTER TABLE public.office_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.office_alerts FROM anon, authenticated;
