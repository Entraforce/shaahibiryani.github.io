-- STAGING ONLY (project shaahi-staging). Never run against production.
-- Applied after 00-prod-schema.sql (production structure, no rows) and before
-- the Uber Direct migration. Purpose: nothing in staging can reach the real
-- kitchen, Clover, printers, alert channels or production endpoints.

do $$ begin
  if current_database() <> 'postgres' then raise exception 'unexpected database'; end if;
end $$;

-- 1. Physical printing OFF (cloudprnt_enabled() fails closed without a row;
--    an explicit false makes the intent visible).
insert into public.integration_settings (key, enabled)
values ('cloudprnt', false)
on conflict (key) do update set enabled = false;

-- 2. No scheduled jobs copied from production (Clover sync, alerts, reconciler).
--    The schema export excludes the cron schema; this removes any that slipped in.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where command ilike '%wtdthjhqgsbnyjucdqxl%' or jobname ilike 'clover%' or jobname ilike '%alert%';
  end if;
end $$;

-- 3. Guard: fail loudly if any function body still points at production.
do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prokind in ('f','p') and pg_get_functiondef(p.oid) ilike '%wtdthjhqgsbnyjucdqxl%';
  if n > 0 then raise exception 'staging isolation: % public function(s) reference the production project', n; end if;
end $$;
