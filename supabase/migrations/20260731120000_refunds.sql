-- ───────────────────────────────────────────────────────────
-- Staff item-level refunds (kitchen dashboard "Refunds" tab).
--
-- Lets kitchen staff pick specific items/quantities on a paid order to
-- refund, with tax computed automatically (proportional to the items
-- selected) instead of the owner hand-calculating a partial refund amount
-- in the Stripe Dashboard.
--
-- Idempotent — safe to paste into the Supabase SQL Editor and re-run.
-- ───────────────────────────────────────────────────────────

-- Track how much of each order line has already been refunded, so the UI
-- can show "remaining refundable qty" and the DB blocks double-refunding.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS refunded_quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_refunded_quantity_valid;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_refunded_quantity_valid
  CHECK (refunded_quantity >= 0 AND refunded_quantity <= quantity);

-- Running totals on the order, in cents (the money-safe unit), so the
-- dashboard never has to re-sum refunds to show "$X refunded so far".
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal_refunded_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_refunded_cents      integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_refund_status_valid;
ALTER TABLE public.orders ADD CONSTRAINT orders_refund_status_valid
  CHECK (refund_status IN ('none','partial','full'));

-- One row per refund — the audit trail (who, when, how much, which items,
-- Stripe's refund id). `items` holds the line-item breakdown as JSON rather
-- than a second table — this is a low-volume audit log, not something we'll
-- ever need to join/report on at scale.
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  performed_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  subtotal_refund_cents integer NOT NULL CHECK (subtotal_refund_cents >= 0),
  tax_refund_cents integer NOT NULL CHECK (tax_refund_cents >= 0),
  items jsonb NOT NULL,
  stripe_payment_intent text NOT NULL,
  stripe_refund_id text,
  idempotency_key uuid NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  UNIQUE (order_id, idempotency_key)
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff can read refunds" ON public.refunds;
CREATE POLICY "staff can read refunds" ON public.refunds
  FOR SELECT USING (public.current_user_is_staff());

-- The one piece of logic that MUST be atomic: reserving the refund (blocking
-- double-refunds of the same item, and computing the proportional tax split)
-- before Stripe is ever called. Everything after this (marking the refund
-- succeeded/failed once Stripe responds) is a plain single-row update done
-- by the Edge Function with the service role — no extra RPC needed for that.
CREATE OR REPLACE FUNCTION public.begin_refund(
  p_order_id uuid,
  p_lines jsonb,          -- [{order_item_id, quantity}, ...]
  p_reason text,
  p_idempotency_key uuid
) RETURNS public.refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_existing refunds%ROWTYPE;
  v_line jsonb;
  v_item order_items%ROWTYPE;
  v_qty int;
  v_subtotal_cents int := 0;
  v_items jsonb := '[]'::jsonb;
  v_original_subtotal_cents int;
  v_original_tax_cents int;
  v_new_cumulative_subtotal int;
  v_ideal_cumulative_tax int;
  v_tax_delta int;
  v_refund refunds%ROWTYPE;
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  -- Idempotent replay: same client request id -> return the existing row,
  -- do NOT reserve again (blocks double-click / network retry).
  SELECT * INTO v_existing FROM refunds
    WHERE order_id = p_order_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'no line items supplied';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id USING errcode = 'P0002';
  END IF;
  IF v_order.payment_status IS DISTINCT FROM 'paid' OR v_order.stripe_payment_intent IS NULL THEN
    RAISE EXCEPTION 'order has no captured payment to refund';
  END IF;

  v_original_subtotal_cents := round(v_order.subtotal * 100)::int;
  v_original_tax_cents      := round(v_order.tax * 100)::int;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_qty := (v_line->>'quantity')::int;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'quantity must be a positive integer';
    END IF;

    -- Atomic reservation: this UPDATE only succeeds if there's still enough
    -- unrefunded quantity on the line, checked against the current row —
    -- Postgres serializes concurrent UPDATEs to the same row, so two staff
    -- refunding the same last unit at once can't both succeed.
    UPDATE order_items
      SET refunded_quantity = refunded_quantity + v_qty
      WHERE id = (v_line->>'order_item_id')::uuid
        AND order_id = p_order_id
        AND refunded_quantity + v_qty <= quantity
      RETURNING * INTO v_item;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'line % cannot be refunded (missing, wrong order, or exceeds remaining quantity)',
        (v_line->>'order_item_id');
    END IF;

    v_subtotal_cents := v_subtotal_cents + round(v_item.unit_price * 100)::int * v_qty;
    v_items := v_items || jsonb_build_object(
      'order_item_id', v_item.id,
      'item_name', v_item.item_name,
      'quantity', v_qty,
      'unit_price_cents', round(v_item.unit_price * 100)::int
    );
  END LOOP;

  v_new_cumulative_subtotal := v_order.subtotal_refunded_cents + v_subtotal_cents;
  IF v_new_cumulative_subtotal > v_original_subtotal_cents THEN
    RAISE EXCEPTION 'refund exceeds order subtotal';
  END IF;

  -- Cumulative proportional tax (not per-op rounding) — guarantees the sum
  -- of every partial refund's tax lands exactly on the order's original tax
  -- if fully refunded across any number of operations, and never overshoots
  -- it at any partial point along the way.
  v_ideal_cumulative_tax := round(
    v_original_tax_cents::numeric * v_new_cumulative_subtotal / greatest(v_original_subtotal_cents, 1)
  )::int;
  IF v_new_cumulative_subtotal = v_original_subtotal_cents THEN
    v_ideal_cumulative_tax := v_original_tax_cents; -- force exact at 100% to kill any residual rounding drift
  END IF;
  v_tax_delta := v_ideal_cumulative_tax - v_order.tax_refunded_cents;

  IF v_subtotal_cents + v_tax_delta <= 0 THEN
    RAISE EXCEPTION 'refund amount must be positive';
  END IF;

  INSERT INTO refunds (order_id, performed_by, reason, status,
                        subtotal_refund_cents, tax_refund_cents, items,
                        stripe_payment_intent, idempotency_key)
  VALUES (p_order_id, auth.uid(), p_reason, 'pending',
          v_subtotal_cents, v_tax_delta, v_items,
          v_order.stripe_payment_intent, p_idempotency_key)
  RETURNING * INTO v_refund;

  UPDATE orders SET
    subtotal_refunded_cents = v_new_cumulative_subtotal,
    tax_refunded_cents = v_ideal_cumulative_tax,
    refund_status = CASE
      WHEN v_new_cumulative_subtotal + v_ideal_cumulative_tax
           >= v_original_subtotal_cents + v_original_tax_cents
      THEN 'full' ELSE 'partial'
    END
  WHERE id = p_order_id;

  RETURN v_refund;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_refund(uuid, jsonb, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.begin_refund(uuid, jsonb, text, uuid) TO authenticated;
