-- M4 push notifications + M3 kitchen printer queue.

-- ============================ push_tokens (M4) ============================
-- One row per device push token; the app upserts after login, deletes on
-- sign-out. notify-order-status Edge Function reads via service role.
CREATE TABLE IF NOT EXISTS public.push_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform   text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx
  ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users manage only their own tokens.
DROP POLICY IF EXISTS push_tokens_own ON public.push_tokens;
CREATE POLICY push_tokens_own ON public.push_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================ print_jobs (M3) ============================
-- Kitchen ticket queue for the Star CloudPRNT printer. A trigger enqueues a
-- job for every new order; the cloudprnt Edge Function (service role) serves
-- and completes jobs as the printer polls.
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'printed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz
);

CREATE INDEX IF NOT EXISTS print_jobs_pending_idx
  ON public.print_jobs (id) WHERE status = 'pending';

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Staff can see the queue (e.g. future dashboard reprint button); the
-- cloudprnt function uses the service role and bypasses RLS.
DROP POLICY IF EXISTS print_jobs_staff_select ON public.print_jobs;
CREATE POLICY print_jobs_staff_select ON public.print_jobs
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff());

-- Enqueue a kitchen ticket for every new order.
CREATE OR REPLACE FUNCTION public.enqueue_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.print_jobs (order_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enqueue_print_job ON public.orders;
CREATE TRIGGER orders_enqueue_print_job
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_print_job();
