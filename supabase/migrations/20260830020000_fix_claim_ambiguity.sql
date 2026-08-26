-- claim_checkout_attempt declared RETURNS TABLE (... status text, order_id uuid ...).
-- In plpgsql those OUT parameters become variables that shadow the identically
-- named COLUMNS of checkout_attempts, so `WHERE status = 'creating'` inside the
-- body was ambiguous and every call raised, which surfaced as a blanket
-- "Could not start checkout" on all 20 concurrent requests.
--
-- The OUT parameters are renamed with an out_ prefix so a column and a result
-- field can never collide again, and every column reference is table-qualified.
DROP FUNCTION IF EXISTS public.claim_checkout_attempt(text, text);

CREATE FUNCTION public.claim_checkout_attempt(
  p_fingerprint text,
  p_phone       text
)
RETURNS TABLE (
  out_attempt_id   uuid,
  out_status       text,
  out_is_creator   boolean,
  out_intent_id    text,
  out_secret       text,
  out_order_id     uuid,
  out_order_number text,
  out_breakdown    jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- A 'creating' row older than 3 minutes is a crashed worker, not a peer.
  UPDATE public.checkout_attempts ca
     SET status = 'expired', updated_at = now()
   WHERE ca.basket_fingerprint = p_fingerprint
     AND ca.guest_phone = p_phone
     AND ca.status = 'creating'
     AND ca.created_at < now() - interval '3 minutes';

  UPDATE public.checkout_attempts ca
     SET status = 'expired', updated_at = now()
   WHERE ca.basket_fingerprint = p_fingerprint
     AND ca.guest_phone = p_phone
     AND ca.status = 'awaiting_payment'
     AND ca.created_at < now() - interval '30 minutes';

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

  -- Lost the race. ON CONFLICT blocked until the winner committed, so this
  -- read is guaranteed to see it — no retry loop required.
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
GRANT EXECUTE ON FUNCTION public.claim_checkout_attempt(text, text) TO service_role;
