-- Uber Direct: delivery_quotes was created during the sandbox build with
-- CHECK (uber_mode = 'sandbox'), so live pilot quotes could not be saved
-- ("Could not save the delivery price"). Orders already allow either mode.
alter table public.delivery_quotes drop constraint if exists delivery_quotes_uber_mode_check;
alter table public.delivery_quotes add constraint delivery_quotes_uber_mode_check check (uber_mode in ('sandbox', 'live'));
