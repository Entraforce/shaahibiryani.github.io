-- Correct the serving guidance on the catering tab: a full tray of biryani
-- feeds 12-15 on its own, stretching past 20 once other trays are ordered
-- alongside it (the earlier '15-20' overstated it on its own).
UPDATE public.web_menu_categories
   SET note = 'Trays are cooked to order — please allow at least 4 hours, or order a day ahead. A full tray of biryani serves about 12–15 on its own, or 20+ alongside a few other trays. Online orders can include up to 2 full trays and 4 half trays; for larger events call (469) 960-3300 at least 4–5 days in advance.'
 WHERE code = 'ctg';
