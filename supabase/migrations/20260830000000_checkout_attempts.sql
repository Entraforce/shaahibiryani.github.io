-- Separates "which purchase is this" from "what is in the basket".
--
-- The previous design used sha256(phone + basket + tip + fulfilment) directly
-- as the Stripe idempotency key. That is a fine BASKET FINGERPRINT and a bad
-- CHECKOUT IDENTITY: a customer who genuinely wants the same lunch twice in one
-- day has the same fingerprint, so Stripe would replay the first PaymentIntent
-- and the second purchase would silently never happen.
--
--   checkout_attempt_id  = one logical purchase        -> the idempotency key
--   basket_fingerprint   = what is in it right now     -> decides attempt reuse
--
-- Retry, timeout, double tap, refresh, lost response  -> same attempt.
-- Deliberate second purchase of the same basket        -> new attempt, because
-- the first is no longer ACTIVE once it is paid.
--
-- It also removes the concurrency race. Claiming is a single INSERT .. ON
-- CONFLICT: Postgres makes the losing inserter WAIT on the unique index until
-- the winner commits, so the loser then reads a committed row. That is why
-- this replaces the retry/sleep loop — the visibility problem cannot occur.

CREATE TABLE IF NOT EXISTS public.checkout_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  basket_fingerprint    text NOT NULL,
  guest_phone           text NOT NULL,
  -- new -> creating -> awaiting_payment -> paid | failed | expired
  status                text NOT NULL DEFAULT 'creating'
                          CHECK (status IN ('creating','awaiting_payment','paid','failed','expired')),
  stripe_payment_intent text,
  client_secret         text,
  order_id              uuid,
  order_number          text,
  amount_cents          integer,
  breakdown             jsonb,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.checkout_attempts IS
  'One row per logical purchase attempt. The id is the Stripe idempotency key, '
  'so retries converge and a deliberate re-purchase of the same basket gets a '
  'fresh id once the previous attempt is no longer active.';

ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: service role only. The browser never reads or writes this.

-- At most ONE active attempt per (basket, phone). This index is what makes the
-- claim atomic — and it only covers live attempts, so a paid or expired one
-- does not block the next genuine purchase.
CREATE UNIQUE INDEX IF NOT EXISTS checkout_attempts_active_key
  ON public.checkout_attempts (basket_fingerprint, guest_phone)
  WHERE status IN ('creating','awaiting_payment');

CREATE INDEX IF NOT EXISTS checkout_attempts_intent_idx
  ON public.checkout_attempts (stripe_payment_intent)
  WHERE stripe_payment_intent IS NOT NULL;

-- ── Atomic claim ───────────────────────────────────────────────────────────
-- Returns the caller's role in one round trip:
--   is_creator = true  -> you own creation; call Stripe and record the result
--   is_creator = false -> someone else is on it; use the returned state
CREATE OR REPLACE FUNCTION public.claim_checkout_attempt(
  p_fingerprint text,
  p_phone       text
)
RETURNS TABLE (
  attempt_id  uuid,
  status      text,
  is_creator  boolean,
  intent_id   text,
  secret      text,
  order_id    uuid,
  order_number text,
  breakdown   jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Anything still 'creating' after 3 minutes is a crashed worker, not a peer.
  UPDATE public.checkout_attempts
     SET status = 'expired', updated_at = now()
   WHERE basket_fingerprint = p_fingerprint
     AND guest_phone = p_phone
     AND status = 'creating'
     AND created_at < now() - interval '3 minutes';

  -- An awaiting_payment attempt is only good for 30 minutes.
  UPDATE public.checkout_attempts
     SET status = 'expired', updated_at = now()
   WHERE basket_fingerprint = p_fingerprint
     AND guest_phone = p_phone
     AND status = 'awaiting_payment'
     AND created_at < now() - interval '30 minutes';

  INSERT INTO public.checkout_attempts (basket_fingerprint, guest_phone, status)
  VALUES (p_fingerprint, p_phone, 'creating')
  ON CONFLICT (basket_fingerprint, guest_phone)
    WHERE status IN ('creating','awaiting_payment')
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, 'creating'::text, true,
                        NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  -- Lost the race. The winner has committed by the time ON CONFLICT released,
  -- so this read is guaranteed to see it.
  RETURN QUERY
    SELECT ca.id, ca.status, false,
           ca.stripe_payment_intent, ca.client_secret,
           ca.order_id, ca.order_number, ca.breakdown
      FROM public.checkout_attempts ca
     WHERE ca.basket_fingerprint = p_fingerprint
       AND ca.guest_phone = p_phone
       AND ca.status IN ('creating','awaiting_payment')
     ORDER BY ca.created_at DESC
     LIMIT 1;
END $$;

REVOKE ALL ON FUNCTION public.claim_checkout_attempt(text, text) FROM public, anon, authenticated;

-- ── Record the created payment against the attempt ─────────────────────────
CREATE OR REPLACE FUNCTION public.complete_checkout_attempt(
  p_attempt_id uuid,
  p_intent     text,
  p_secret     text,
  p_order      uuid,
  p_order_no   text,
  p_amount     integer,
  p_breakdown  jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.checkout_attempts
     SET status = 'awaiting_payment',
         stripe_payment_intent = p_intent,
         client_secret = p_secret,
         order_id = p_order,
         order_number = p_order_no,
         amount_cents = p_amount,
         breakdown = p_breakdown,
         updated_at = now()
   WHERE id = p_attempt_id;
$$;

REVOKE ALL ON FUNCTION public.complete_checkout_attempt(uuid,text,text,uuid,text,integer,jsonb)
  FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fail_checkout_attempt(p_attempt_id uuid, p_error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.checkout_attempts
     SET status = 'failed', last_error = left(p_error, 300), updated_at = now()
   WHERE id = p_attempt_id;
$$;

REVOKE ALL ON FUNCTION public.fail_checkout_attempt(uuid, text) FROM public, anon, authenticated;

-- Once an order is paid its attempt is closed, freeing the (basket, phone)
-- pair so the same customer can order the same thing again.
CREATE OR REPLACE FUNCTION public.close_checkout_attempt_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.checkout_attempts
     SET status = 'paid', updated_at = now()
   WHERE order_id = NEW.id AND status <> 'paid';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_close_checkout_attempt ON public.orders;
CREATE TRIGGER orders_close_checkout_attempt
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.close_checkout_attempt_on_paid();
