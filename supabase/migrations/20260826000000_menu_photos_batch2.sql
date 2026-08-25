-- Ten studio photos from the owner's shoot, added to the online menu.
-- Files live in assets/menu-photos/ (same library the app bundles), named
-- by menu-item id so app and website stay in step.

UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/mango-lassi-single.jpg'
 WHERE pid LIKE 'mango-lassi-single|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/mango-lassi-jug.jpg'
 WHERE pid LIKE 'mango-lassi-jug|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/zafrani-mutton.jpg'
 WHERE pid LIKE 'zafrani-mutton|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/chicken-malai-boti-roll.jpg'
 WHERE pid LIKE 'chicken-malai-boti-roll|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/butter-naan.jpg'
 WHERE pid LIKE 'butter-naan|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/sitaphal-rabdi.jpg'
 WHERE pid LIKE 'sitaphal-rabdi|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/fish-pakora.jpg'
 WHERE pid LIKE 'fish-pakora|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/kubani-ka-meeta.jpg'
 WHERE pid LIKE 'kubani-ka-meeta|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/thumbs-up.jpg'
 WHERE pid LIKE 'thumbs-up|%';
UPDATE public.web_menu_items SET image_url = 'assets/menu-photos/water-bottle.jpg'
 WHERE pid LIKE 'water-bottle|%';
