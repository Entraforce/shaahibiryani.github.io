-- Structured record of catering quote requests, so a closed deal's revenue
-- can later be matched back to the ad click that produced it.
--
-- Today the catering quote form on every catering-<city>.html page posts
-- straight to formsubmit.co, which only ever becomes an email — there is no
-- database row, so there is nothing a later "upload this as an offline
-- conversion" step could query. That email flow is left completely
-- unchanged; this table is written to IN PARALLEL by a non-blocking fetch()
-- from the same form submit, purely additive.
--
-- A catering deal usually closes days or weeks later by phone, after
-- negotiation — so this starts as a lead, not an order, and status/
-- closed_value_cents are filled in by hand once it's won (Supabase Table
-- Editor for now; see scripts/export-offline-conversions.mjs for the export
-- step once a lead is marked 'won').

CREATE TABLE IF NOT EXISTS public.catering_leads (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at        timestamptz NOT NULL DEFAULT now(),
  city              text NOT NULL,              -- which catering-<city>.html page, e.g. 'Plano'
  name              text NOT NULL,
  phone             text NOT NULL,
  email             text,
  event_date        date,
  guest_count       integer,
  event_type        text,
  details           text,
  -- Same shape as orders.attribution: {first:{click,source,medium,campaign,term,referrer,landing,at}, last:{...}}.
  -- Null when the guest declined non-essential cookies, or arrived with no
  -- ad/UTM markers at all — a legitimate answer, not a missing one.
  attribution       jsonb,
  status            text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'quoted', 'won', 'lost')),
  closed_value_cents integer CHECK (closed_value_cents IS NULL OR closed_value_cents >= 0),
  closed_at         timestamptz,
  -- Set by scripts/export-offline-conversions.mjs once a 'won' lead has been
  -- written into a Google Ads offline-conversion-import CSV, so the same
  -- conversion is never uploaded twice.
  exported_at       timestamptz
);

CREATE INDEX IF NOT EXISTS catering_leads_export_idx
  ON public.catering_leads (status)
  WHERE status = 'won' AND exported_at IS NULL;

ALTER TABLE public.catering_leads ENABLE ROW LEVEL SECURITY;
-- No public read or write policy, deliberately: this is a lead list with
-- names/phone numbers/ad-click ids, not display data like the menu tables.
-- The create-catering-lead Edge Function writes with the service role,
-- which bypasses RLS; everything else (marking a lead won, running the
-- export script) also goes through the service role, same pattern as
-- web_menu_* and dining_tables.
