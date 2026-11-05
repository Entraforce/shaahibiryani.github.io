-- catering_inquiries: every catering quote request from the website, as a
-- database record (the system of record; the formsubmit.co email is now only
-- the notification).
--
-- Naming (owner decision 2026-11-05): catering_inquiries = raw inbound customer
-- requests. Kept apart from catering_opportunities (qualified sales
-- opportunities, later) and sales_prospects (outbound/harvested businesses,
-- e.g. ARM's OpenStreetMap list). Those must never share a table.
--
-- 20261006000000_catering_leads.sql was never applied to production: the app
-- repo's 20261006000000_stripe_events_order_source.sql took the same version
-- number first, so the migration history showed 20261006000000 as done and
-- the table was never created. create-catering-lead was never deployed either,
-- so every catering form since then reached the team by email only.
--
-- catering_inquiries has the original catering_leads shape (catering_leads
-- never existed in production) plus what the ingestion path needs:
--   submission_id    one id per filled-in form, generated in the browser and
--                    reused on every retry, so a retry or a double click can
--                    never create a second lead (UNIQUE; NULL allowed for any
--                    older rows);
--   form_page        which page the form was on ('/', '/catering-plano', ...);
--   request_context  how the visitor arrived on THIS visit, read from the page
--                    URL and referrer at submit time (utm_*, referrer host,
--                    landing path). Unlike attribution it needs no cookie
--                    consent, because nothing is stored on the device.
-- city is optional: the homepage form leaves "City / Area" optional.
-- Purely additive: no existing table or row is changed.

CREATE TABLE IF NOT EXISTS public.catering_inquiries (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  submission_id      uuid CONSTRAINT catering_inquiries_submission_id_key UNIQUE,
  form_page          text,
  city               text,
  name               text NOT NULL,
  phone              text NOT NULL,
  email              text,
  event_date         date,
  guest_count        integer,
  event_type         text,
  details            text,
  -- Same shape as orders.attribution: {first:{click,source,medium,campaign,term,referrer,landing,at}, last:{...}}.
  -- Null when the guest declined non-essential cookies or arrived with no markers.
  attribution        jsonb,
  request_context    jsonb,
  status             text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'quoted', 'won', 'lost')),
  closed_value_cents integer CHECK (closed_value_cents IS NULL OR closed_value_cents >= 0),
  closed_at          timestamptz,
  exported_at        timestamptz
);

CREATE INDEX IF NOT EXISTS catering_inquiries_export_idx
  ON public.catering_inquiries (status)
  WHERE status = 'won' AND exported_at IS NULL;
CREATE INDEX IF NOT EXISTS catering_inquiries_created_idx ON public.catering_inquiries (created_at DESC);

-- Lead list with names and phone numbers: no public read or write. Only the
-- create-catering-lead function (service role) writes here.
ALTER TABLE public.catering_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catering_inquiries FROM anon, authenticated;
