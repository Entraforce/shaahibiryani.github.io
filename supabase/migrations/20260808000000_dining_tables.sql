-- Real table-capacity awareness for dining reservations, seeded from the
-- Plano floor plan (14 tables, 3 staff-only). The `reservations` table
-- already existed (predates tracked migrations) with a party_size/
-- reservation_time/status workflow but no notion of a specific table — this
-- adds that, plus the FK column linking a reservation to the table the
-- reserve-table Edge Function assigned it.

CREATE TABLE IF NOT EXISTS public.dining_tables (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_number integer NOT NULL UNIQUE,
  capacity    integer NOT NULL CHECK (capacity > 0),
  shape       text NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'circle')),
  is_bookable boolean NOT NULL DEFAULT true, -- false for staff/employee tables
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON public.dining_tables;
CREATE POLICY "public read" ON public.dining_tables
  FOR SELECT TO public USING (true);
-- No public write policy — the floor plan is staff/owner-managed directly
-- in Supabase (or a future kadmin-style tool), same pattern as web_menu_*.

INSERT INTO public.dining_tables (table_number, capacity, shape, is_bookable) VALUES
  (1, 6, 'rect', false),   -- Employee
  (2, 6, 'rect', true),
  (3, 6, 'rect', true),
  (4, 4, 'circle', true),
  (5, 8, 'rect', true),
  (6, 4, 'circle', true),
  (7, 8, 'rect', true),
  (8, 8, 'rect', true),
  (9, 4, 'rect', false),   -- Employee
  (10, 4, 'rect', true),
  (11, 4, 'rect', true),
  (12, 7, 'rect', true),
  (13, 7, 'rect', true),
  (14, 7, 'rect', false)   -- Employee
ON CONFLICT (table_number) DO NOTHING;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS table_id bigint REFERENCES public.dining_tables (id);

CREATE INDEX IF NOT EXISTS reservations_time_idx
  ON public.reservations (reservation_time)
  WHERE status IN ('pending', 'confirmed', 'seated');

-- Guests can cancel their own reservation (status -> 'cancelled'); everything
-- else about a confirmed booking (table_id, time) is server-assigned by the
-- reserve-table Edge Function using the service role, which bypasses RLS.
DROP POLICY IF EXISTS "own reservations cancel" ON public.reservations;
CREATE POLICY "own reservations cancel" ON public.reservations
  FOR UPDATE TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
