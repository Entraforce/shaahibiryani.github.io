#!/usr/bin/env node
// Refreshes index.html's Restaurant JSON-LD aggregateRating (ratingValue +
// reviewCount) from the live Google rating via the Places API (New).
//
// Requires env var GOOGLE_PLACES_API_KEY (a key restricted to Places API).
// Run manually with `node scripts/update-review-rating.mjs`, or on a
// schedule via .github/workflows/update-review-rating.yml.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(__dirname, "..", "index.html");

// Shaahi Biryani, 3421 E Renner Rd, Suite 110, Plano, TX 75074 — looked up
// once via the Places API (New) Text Search tool and confirmed by its
// returned types (halal_restaurant, banquet_hall, catering_service,
// pakistani_restaurant, indian_restaurant). Stable unless the Business
// Profile listing itself is ever merged/recreated.
const PLACE_ID = "ChIJk1VdZQAZTIYR2hScWLk-YHg";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error("GOOGLE_PLACES_API_KEY is not set — aborting.");
  process.exit(1);
}

const AGGREGATE_RATING_RE =
  /("aggregateRating":\s*\{\s*"@type":\s*"AggregateRating",\s*"ratingValue":\s*")([^"]+)("\s*,\s*"reviewCount":\s*")([^"]+)("\s*\}\s*,)/;

async function fetchLiveRating() {
  const url = `https://places.googleapis.com/v1/places/${PLACE_ID}`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": "rating,userRatingCount",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places API request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  const rating = Number(data.rating);
  const reviewCount = Number(data.userRatingCount);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error(`Implausible rating from API: ${data.rating}`);
  }
  if (!Number.isInteger(reviewCount) || reviewCount < 1) {
    throw new Error(`Implausible review count from API: ${data.userRatingCount}`);
  }
  return { rating: rating.toFixed(1), reviewCount: String(reviewCount) };
}

function main() {
  const html = readFileSync(INDEX_PATH, "utf8");
  const match = html.match(AGGREGATE_RATING_RE);
  if (!match) {
    console.error("Could not find the aggregateRating block in index.html — aborting without changes.");
    process.exit(1);
  }
  const currentRating = match[2];
  const currentCount = Number(match[4]);

  fetchLiveRating()
    .then(({ rating, reviewCount }) => {
      const newCount = Number(reviewCount);
      // Google review counts don't realistically drop by more than a
      // handful at once (occasional spam-review removals aside) — guard
      // against a bad/empty API response silently wiping out real data.
      if (newCount < currentCount - 5) {
        throw new Error(
          `New review count (${newCount}) is suspiciously lower than current (${currentCount}) — refusing to update. Check the API response manually.`
        );
      }

      if (rating === currentRating && reviewCount === String(currentCount)) {
        console.log(`No change: ${rating} stars, ${reviewCount} reviews.`);
        return;
      }

      const updated = html.replace(
        AGGREGATE_RATING_RE,
        `$1${rating}$3${reviewCount}$5`
      );
      writeFileSync(INDEX_PATH, updated);
      console.log(
        `Updated aggregateRating: ${currentRating} stars / ${currentCount} reviews -> ${rating} stars / ${reviewCount} reviews.`
      );
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

main();
