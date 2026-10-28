#!/usr/bin/env node
// Phase 3 enterprise SEO: fetches a broad, public-facing snapshot of the
// Google Business Profile listing via the Places API (New), for comparing
// against the website's own NAP/hours/category claims.
//
// Requires env var GOOGLE_PLACES_API_KEY (same restricted key used by
// scripts/update-review-rating.mjs). Prints JSON to stdout — only public
// listing fields, nothing secret.
//
// Run manually: node scripts/fetch-gbp-snapshot.mjs
// Or via .github/workflows/fetch-gbp-snapshot.yml (workflow_dispatch only).

const PLACE_ID = "ChIJk1VdZQAZTIYR2hScWLk-YHg";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error("GOOGLE_PLACES_API_KEY is not set — aborting.");
  process.exit(1);
}

const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "regularOpeningHours",
  "currentOpeningHours",
  "businessStatus",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "rating",
  "userRatingCount",
  "priceLevel",
  "editorialSummary",
  "reservable",
  "servesBreakfast",
  "servesLunch",
  "servesDinner",
  "takeout",
  "delivery",
  "dineIn",
  "photos",
].join(",");

async function main() {
  const url = `https://places.googleapis.com/v1/places/${PLACE_ID}`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELDS,
    },
  });
  if (!res.ok) {
    console.error(`Places API request failed: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  const data = await res.json();
  // Trim photo references down to just counts/names — photo URIs require a
  // separate signed-media fetch and aren't needed for a text comparison.
  if (Array.isArray(data.photos)) {
    data.photoCount = data.photos.length;
    delete data.photos;
  }
  console.log(JSON.stringify(data, null, 2));
}

main();
