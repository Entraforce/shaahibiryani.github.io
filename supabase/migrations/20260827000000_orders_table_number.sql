-- Dine-in ordering, step 1: give an order a table to be delivered to.
--
-- `orders` predates git history, so its fulfillment column is not described by
-- any migration here. This adds the table number and PROBES the existing
-- fulfillment definition (via RAISE NOTICE) rather than assuming its shape —
-- widening it, if that turns out to be necessary, is a separate migration
-- because ALTER TYPE ... ADD VALUE cannot run inside a transaction.

-- Nullable: only dine-in orders carry a table. Range matches dining_tables,
-- which seeds 1..13 as bookable (20260808000000_dining_tables.sql).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_number smallint;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_table_number_range;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_table_number_range
  CHECK (table_number IS NULL OR (table_number BETWEEN 1 AND 13));

COMMENT ON COLUMN public.orders.table_number IS
  'Dine-in only: the table the guest is seated at (1-13). NULL for pickup/delivery.';

-- Report what fulfillment actually is, so the next step is informed rather
-- than speculative. Pure inspection — changes nothing.
DO $$
DECLARE
  ftype   regtype;
  is_enum boolean;
  labels  text;
  c       record;
  found   boolean := false;
BEGIN
  SELECT atttypid::regtype INTO ftype
    FROM pg_attribute
   WHERE attrelid = 'public.orders'::regclass
     AND attname = 'fulfillment'
     AND NOT attisdropped;

  IF ftype IS NULL THEN
    RAISE NOTICE 'PROBE: orders has no fulfillment column';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_type WHERE oid = ftype AND typtype = 'e')
    INTO is_enum;
  RAISE NOTICE 'PROBE: orders.fulfillment type=% enum=%', ftype, is_enum;

  IF is_enum THEN
    SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder) INTO labels
      FROM pg_enum WHERE enumtypid = ftype;
    RAISE NOTICE 'PROBE: enum labels = [%]', labels;
    RAISE NOTICE 'PROBE: accepts dine_in = %',
      EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = ftype AND enumlabel = 'dine_in');
  ELSE
    FOR c IN
      SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conrelid = 'public.orders'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%fulfillment%'
    LOOP
      found := true;
      RAISE NOTICE 'PROBE: check % => %', c.conname, c.def;
      RAISE NOTICE 'PROBE: accepts dine_in = %', c.def ILIKE '%dine_in%';
    END LOOP;
    IF NOT found THEN
      RAISE NOTICE 'PROBE: no CHECK constrains fulfillment — free text, dine_in is accepted';
    END IF;
  END IF;
END $$;
