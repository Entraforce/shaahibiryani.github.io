-- ───────────────────────────────────────────────────────────
-- Capture the base RLS policies that predate this repo's git history.
--
-- These tables/policies were created directly in the Supabase dashboard
-- before this project had version control — until now, nothing in this
-- repo recorded what they actually said, only a memory-note claiming
-- "customer data isolation is verified solid." This migration is a
-- verbatim snapshot of the live policies as read directly from
-- pg_policies on 2026-07-31, so that claim is now something anyone can
-- read, diff, and re-verify after every future change instead of trusting
-- forever. Running this against the current production database should be
-- a NO-OP (every statement recreates exactly what's already live) — it
-- exists for the commit history, not to change anything today.
--
-- Idempotent — safe to paste into the Supabase SQL Editor and re-run.
-- ───────────────────────────────────────────────────────────

-- ── Public catalog tables (menu display data — intentionally world-readable) ──
alter table public.categories enable row level security;
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select to public using (true);

alter table public.item_addons enable row level security;
drop policy if exists "public read item_addons" on public.item_addons;
create policy "public read item_addons" on public.item_addons for select to public using (true);

alter table public.item_variants enable row level security;
drop policy if exists "public read item_variants" on public.item_variants;
create policy "public read item_variants" on public.item_variants for select to public using (true);

alter table public.locations enable row level security;
drop policy if exists "public read locations" on public.locations;
create policy "public read locations" on public.locations for select to public using (true);

alter table public.menu_items enable row level security;
drop policy if exists "public read menu_items" on public.menu_items;
create policy "public read menu_items" on public.menu_items for select to public using (true);

alter table public.rewards enable row level security;
drop policy if exists "public read rewards" on public.rewards;
create policy "public read rewards" on public.rewards for select to public using (true);

-- Anyone can read active promo codes — confirmed live behavior, flagged
-- separately as a business-logic question (not a code defect) since it
-- means promo codes can't be kept exclusive/targeted by relying on RLS.
alter table public.promo_codes enable row level security;
drop policy if exists "public read promo_codes" on public.promo_codes;
create policy "public read promo_codes" on public.promo_codes for select to public using (is_active = true);

-- ── Customer-scoped tables (the core isolation guarantee) ──
alter table public.orders enable row level security;
drop policy if exists "own orders read" on public.orders;
create policy "own orders read" on public.orders for select to public using (auth.uid() = user_id);
drop policy if exists "own orders insert" on public.orders;
create policy "own orders insert" on public.orders for insert to public with check (auth.uid() = user_id);
drop policy if exists "orders_staff_select" on public.orders;
create policy "orders_staff_select" on public.orders for select to authenticated using (current_user_is_staff());

alter table public.order_items enable row level security;
drop policy if exists "own order items read" on public.order_items;
create policy "own order items read" on public.order_items for select to public using (
  exists (select 1 from orders o where o.id = order_items.order_id and o.user_id = auth.uid())
);
drop policy if exists "own order items insert" on public.order_items;
create policy "own order items insert" on public.order_items for insert to public with check (
  exists (select 1 from orders o where o.id = order_items.order_id and o.user_id = auth.uid())
);
drop policy if exists "order_items_staff_select" on public.order_items;
create policy "order_items_staff_select" on public.order_items for select to authenticated using (current_user_is_staff());

alter table public.profiles enable row level security;
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to public using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to public using (auth.uid() = id);
drop policy if exists "profiles_staff_select" on public.profiles;
create policy "profiles_staff_select" on public.profiles for select to authenticated using (current_user_is_staff());

alter table public.loyalty_transactions enable row level security;
drop policy if exists "own loyalty read" on public.loyalty_transactions;
create policy "own loyalty read" on public.loyalty_transactions for select to public using (auth.uid() = user_id);

alter table public.reservations enable row level security;
drop policy if exists "own reservations read" on public.reservations;
create policy "own reservations read" on public.reservations for select to public using (auth.uid() = user_id);
drop policy if exists "own reservations insert" on public.reservations;
create policy "own reservations insert" on public.reservations for insert to public with check (auth.uid() = user_id);

alter table public.push_tokens enable row level security;
drop policy if exists "own tokens all" on public.push_tokens;
create policy "own tokens all" on public.push_tokens for all to public using (auth.uid() = user_id);
drop policy if exists "push_tokens_own" on public.push_tokens;
create policy "push_tokens_own" on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Staff-only tables ──
alter table public.payment_orphans enable row level security;
drop policy if exists "payment_orphans_staff_select" on public.payment_orphans;
create policy "payment_orphans_staff_select" on public.payment_orphans for select to authenticated using (current_user_is_staff());
drop policy if exists "payment_orphans_staff_update" on public.payment_orphans;
create policy "payment_orphans_staff_update" on public.payment_orphans for update to authenticated using (current_user_is_staff());

alter table public.print_jobs enable row level security;
drop policy if exists "print_jobs_staff_select" on public.print_jobs;
create policy "print_jobs_staff_select" on public.print_jobs for select to authenticated using (current_user_is_staff());

-- ── Website menu admin (owner-only write, matches kadmin.html's OWNER_EMAIL) ──
alter table public.web_menu_items enable row level security;
drop policy if exists "public read" on public.web_menu_items;
create policy "public read" on public.web_menu_items for select to public using (true);
drop policy if exists "owner write" on public.web_menu_items;
create policy "owner write" on public.web_menu_items for all to authenticated
  using ((auth.jwt() ->> 'email') = 'kitchen@shaahibiryanidfw.com')
  with check ((auth.jwt() ->> 'email') = 'kitchen@shaahibiryanidfw.com');

alter table public.web_menu_cards enable row level security;
drop policy if exists "public read" on public.web_menu_cards;
create policy "public read" on public.web_menu_cards for select to public using (true);
drop policy if exists "owner write" on public.web_menu_cards;
create policy "owner write" on public.web_menu_cards for all to authenticated
  using ((auth.jwt() ->> 'email') = 'kitchen@shaahibiryanidfw.com')
  with check ((auth.jwt() ->> 'email') = 'kitchen@shaahibiryanidfw.com');

alter table public.web_menu_categories enable row level security;
drop policy if exists "public read" on public.web_menu_categories;
create policy "public read" on public.web_menu_categories for select to public using (true);
drop policy if exists "owner write" on public.web_menu_categories;
create policy "owner write" on public.web_menu_categories for all to authenticated
  using ((auth.jwt() ->> 'email') = 'kitchen@shaahibiryanidfw.com')
  with check ((auth.jwt() ->> 'email') = 'kitchen@shaahibiryanidfw.com');

-- ── reservation_slots: RLS is enabled with ZERO policies defined. ──
-- This means every role except service_role is denied by default — the
-- safest possible state, but confirm the reservation-availability UI reads
-- this table through a server function/service role rather than directly,
-- since a direct client-side SELECT would return nothing.
