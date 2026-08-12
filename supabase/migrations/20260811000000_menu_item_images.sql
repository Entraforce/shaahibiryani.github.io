-- Per-item photos for the online menu (previously text-only). Populated by
-- mapping the app's existing menu photo library onto the website's
-- web_menu_items by pid, uploaded into assets/menu-photos/ in this repo —
-- a separate folder from assets/dishes/ (the homepage bestseller carousel,
-- left untouched).
ALTER TABLE public.web_menu_items
  ADD COLUMN IF NOT EXISTS image_url text;
