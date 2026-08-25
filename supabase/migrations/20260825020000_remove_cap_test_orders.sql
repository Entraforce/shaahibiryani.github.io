-- Remove four orders created while testing the catering tray cap against the
-- production create-web-order function. All were unpaid with no card attached
-- (no money moved, and the kitchen dashboard only shows paid orders), but they
-- would otherwise sit in the orders table as phantom $600-700 catering orders.
DELETE FROM public.order_items
 WHERE order_id IN (
   '4e03f8ae-f54e-40f9-ad14-2ba30e0cc40e',
   'f4b5618a-9f4d-4f19-beb4-3ac15a0b1249',
   'e20d5ff4-1529-4077-bed8-4dc5c8c13ef9',
   'cd433589-c955-4c2f-9dbe-40d32cc36594'
 );

DELETE FROM public.orders
 WHERE id IN (
   '4e03f8ae-f54e-40f9-ad14-2ba30e0cc40e',
   'f4b5618a-9f4d-4f19-beb4-3ac15a0b1249',
   'e20d5ff4-1529-4077-bed8-4dc5c8c13ef9',
   'cd433589-c955-4c2f-9dbe-40d32cc36594'
 );
