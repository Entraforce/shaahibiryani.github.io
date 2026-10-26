// Order-shape rules shared by the website's order function and its tests.
// Plain JS (no Deno or Node APIs) so create-web-order can import it and the
// tests in scripts/ can run it under Node.

// Add-on naans ($0.50–$0.99) exist only to go alongside a main dish. They are
// their own menu rows (pid "<naan>|<naan>-addon") so they can be priced, but an
// order made of nothing else is refused — the same rule the app's
// create-payment-intent enforces, with the same message. The server decides
// this; the browser's cart is never trusted to.
export const ADD_ON_VARIANT_SUFFIX = "-addon";

export function isAddOnLine(line) {
  return String(line?.variantId ?? "").endsWith(ADD_ON_VARIANT_SUFFIX);
}

/** The refusal message when every line is an add-on, else null. */
export function addOnOnlyError(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items.every(isAddOnLine)
    ? "Add-on naans come with a main dish. Please add a dish to your order."
    : null;
}

// One add-on naan per curry or grill dish — the register's rule (Clover's
// Naan/Rice choice is one pick per dish). Curries and grill items are the
// website categories below; biryani, rolls, appetizers etc. don't earn one.
export const NAAN_CATEGORIES = ["chk", "lmb", "veg", "grl"];
export const NAAN_LIMIT_MSG =
  "Add-on naans are one per curry or grill dish. Please remove the extra naan.";

/** Refusal when add-on naans outnumber curry/grill dishes, else null.
 *  `categoryOf(pid)` returns the website category code for a line's pid. */
export function addOnLimitError(items, categoryOf) {
  if (!Array.isArray(items)) return null;
  let addOns = 0, dishes = 0;
  for (const line of items) {
    const qty = Number(line?.quantity) || 0;
    if (isAddOnLine(line)) addOns += qty;
    else if (NAAN_CATEGORIES.includes(categoryOf(`${line?.menuItemId}|${line?.variantId}`))) dishes += qty;
  }
  return addOns > dishes ? NAAN_LIMIT_MSG : null;
}
