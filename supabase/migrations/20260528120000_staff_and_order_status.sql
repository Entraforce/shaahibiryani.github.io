-- Staff role + kitchen order management
-- Adds an is_staff flag to profiles, gives staff read access to all orders,
-- and exposes a guarded RPC for advancing order status.
-- All statements are idempotent (safe to re-run).
--
-- RLS note: Postgres RLS policies are OR-combined (permissive). The staff
-- SELECT policies below are ADDED alongside the existing customer policies
-- (which restrict customers to their own rows) without removing them.

-- ───────────────────────────────────────────────────────────
-- 1. Staff flag on profiles
-- ───────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false;

-- ───────────────────────────────────────────────────────────
-- 2. Helper: is the CURRENT auth user a staff member?
--    SECURITY DEFINER so the internal read bypasses RLS — this both
--    avoids policy recursion and lets the check work inside other policies.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_staff FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ───────────────────────────────────────────────────────────
-- 3. Staff READ policies (additive — existing customer policies remain)
-- ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS orders_staff_select ON public.orders;
CREATE POLICY orders_staff_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff());

DROP POLICY IF EXISTS order_items_staff_select ON public.order_items;
CREATE POLICY order_items_staff_select ON public.order_items
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff());

-- Staff need customer name/phone to fulfil orders.
DROP POLICY IF EXISTS profiles_staff_select ON public.profiles;
CREATE POLICY profiles_staff_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff());

-- ───────────────────────────────────────────────────────────
-- 4. Guarded status-update RPC
--    Staff-only, validates the target status, and updates ONLY the status
--    column (so the existing revoke_loyalty_on_cancel trigger still fires on
--    a transition to 'cancelled'). SECURITY DEFINER so it can update rows the
--    caller couldn't otherwise UPDATE — the is_staff() gate is the protection.
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_order_status(p_order_id uuid, p_status text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated public.orders;
BEGIN
  IF NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_status NOT IN (
    'pending','accepted','preparing','ready',
    'out_for_delivery','delivered','cancelled'
  ) THEN
    RAISE EXCEPTION 'invalid status: %', p_status USING errcode = '22023';
  END IF;

  -- status is an order_status enum, not text — cast explicitly.
  UPDATE public.orders
     SET status = p_status::order_status
   WHERE id = p_order_id
  RETURNING * INTO updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id USING errcode = 'P0002';
  END IF;

  RETURN updated;
END;
$$;

-- Only logged-in users may even attempt it; the is_staff() check does the rest.
REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;
