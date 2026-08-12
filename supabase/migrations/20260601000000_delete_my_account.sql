-- In-app account deletion (Apple App Store guideline 5.1.1(v))
-- A SECURITY DEFINER function that lets a logged-in user delete THEIR OWN
-- account and associated data, then removes their auth.users row.
-- Callable from the client with the user's session (no service-role key needed).

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '42501';
  END IF;

  -- Delete the user's data. Children first, in case FKs aren't ON DELETE CASCADE.
  DELETE FROM public.loyalty_transactions WHERE user_id = uid;
  DELETE FROM public.order_items
    WHERE order_id IN (SELECT id FROM public.orders WHERE user_id = uid);
  DELETE FROM public.orders WHERE user_id = uid;

  -- push_tokens may not exist yet (added with push notifications) — guard it.
  IF to_regclass('public.push_tokens') IS NOT NULL THEN
    DELETE FROM public.push_tokens WHERE user_id = uid;
  END IF;

  DELETE FROM public.profiles WHERE id = uid;

  -- Finally remove the auth account itself (cascades sessions/identities).
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Only a logged-in user may call it; it can only ever delete the caller (auth.uid()).
REVOKE ALL ON FUNCTION public.delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
