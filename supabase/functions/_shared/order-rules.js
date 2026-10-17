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
