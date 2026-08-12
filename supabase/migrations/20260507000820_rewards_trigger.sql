-- Rewards trigger migration
-- Awards points on order insert, reverses on cancellation.
-- Tiers driven by lifetime points (sticky).

-- ───────────────────────────────────────────────────────────
-- 1. Schema additions (idempotent)
-- ───────────────────────────────────────────────────────────

-- ADD COLUMN IF NOT EXISTS handles the fresh-DB case.
-- The audit showed points_redeemed already exists as NULLABLE on the live DB,
-- so the next three statements promote it to NOT NULL DEFAULT 0 idempotently.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS points_redeemed integer NOT NULL DEFAULT 0;

UPDATE public.orders
  SET points_redeemed = 0
  WHERE points_redeemed IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN points_redeemed SET DEFAULT 0;

ALTER TABLE public.orders
  ALTER COLUMN points_redeemed SET NOT NULL;

-- Lifetime tracker for sticky tiers.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifetime_loyalty_points integer NOT NULL DEFAULT 0;

-- Backfill: existing test users with positive loyalty_points seed lifetime so
-- they don't drop tier on first run. GREATEST defends against negative
-- loyalty_points (which shouldn't exist but be defensive).
-- Idempotent: lifetime_loyalty_points = 0 only on first run for legacy rows.
UPDATE public.profiles
  SET lifetime_loyalty_points = GREATEST(loyalty_points, 0)
  WHERE lifetime_loyalty_points = 0;

-- ───────────────────────────────────────────────────────────
-- 2. Award function (AFTER INSERT on orders)
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.award_loyalty_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  earned        integer;
  redeemed      integer;
  new_lifetime  integer;
  new_tier      text;
BEGIN
  earned   := floor(NEW.subtotal)::integer;
  redeemed := NEW.points_redeemed;

  IF earned > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, points_change, reason)
    VALUES (NEW.user_id, NEW.id, earned, 'order placed');
  END IF;

  IF redeemed > 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, points_change, reason)
    VALUES (NEW.user_id, NEW.id, -redeemed, 'order redemption');
  END IF;

  UPDATE public.profiles
  SET
    loyalty_points          = loyalty_points + earned - redeemed,
    lifetime_loyalty_points = lifetime_loyalty_points + earned
  WHERE id = NEW.user_id
  RETURNING lifetime_loyalty_points INTO new_lifetime;

  new_tier := CASE
    WHEN new_lifetime >= 2000 THEN 'gold'
    WHEN new_lifetime >= 500  THEN 'silver'
    ELSE 'bronze'
  END;

  UPDATE public.profiles
  SET loyalty_tier = new_tier
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- ───────────────────────────────────────────────────────────
-- 3. Revoke function (AFTER UPDATE on orders, status → cancelled)
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revoke_loyalty_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  net           integer;
  earned_only   integer;
  new_lifetime  integer;
  new_tier      text;
BEGIN
  -- Net change to current wallet from this order's prior transactions.
  SELECT COALESCE(SUM(points_change), 0)
    INTO net
    FROM public.loyalty_transactions
   WHERE order_id = NEW.id;

  -- Positive (earned) rows only, for lifetime rollback.
  -- Lifetime never decreases for redemptions — only for unmade earnings.
  SELECT COALESCE(SUM(points_change), 0)
    INTO earned_only
    FROM public.loyalty_transactions
   WHERE order_id = NEW.id AND points_change > 0;

  -- Skip the reversal row entirely if net is zero (defensive — covers a
  -- hypothetical cancel-before-insert-trigger race, or a row with no txns).
  IF net <> 0 THEN
    INSERT INTO public.loyalty_transactions (user_id, order_id, points_change, reason)
    VALUES (NEW.user_id, NEW.id, -net, 'order cancelled');
  END IF;

  UPDATE public.profiles
  SET
    loyalty_points          = loyalty_points - net,
    lifetime_loyalty_points = lifetime_loyalty_points - earned_only
  WHERE id = NEW.user_id
  RETURNING lifetime_loyalty_points INTO new_lifetime;

  new_tier := CASE
    WHEN new_lifetime >= 2000 THEN 'gold'
    WHEN new_lifetime >= 500  THEN 'silver'
    ELSE 'bronze'
  END;

  UPDATE public.profiles
  SET loyalty_tier = new_tier
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- ───────────────────────────────────────────────────────────
-- 4. Triggers (drop-then-create for idempotency)
-- ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS award_loyalty_on_order ON public.orders;
CREATE TRIGGER award_loyalty_on_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.award_loyalty_on_order();

DROP TRIGGER IF EXISTS revoke_loyalty_on_cancel ON public.orders;
CREATE TRIGGER revoke_loyalty_on_cancel
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled')
EXECUTE FUNCTION public.revoke_loyalty_on_cancel();
