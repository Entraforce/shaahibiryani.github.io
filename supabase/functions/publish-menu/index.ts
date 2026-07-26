// publish-menu — regenerates the website's menu from the web_menu_* tables and
// commits the result to GitHub (GitHub Pages redeploys automatically, live in
// about a minute).
//
// Called by /kadmin when the owner presses Publish. Auth: the request must
// carry a Supabase user JWT whose email matches OWNER_EMAIL.
//
// Secrets required (supabase secrets set ...):
//   GITHUB_TOKEN  — token with push access to the site repo
//   OWNER_EMAIL   — the only email allowed to publish
// Optional:
//   GITHUB_REPO   — default "Entraforce/shaahibiryani.github.io"
//   GITHUB_BRANCH — default "main"
// Plus the standard SUPABASE_URL / SUPABASE_ANON_KEY provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchMenuData, renderAll } from "../_shared/render-menu.js";

const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "";
const REPO = Deno.env.get("GITHUB_REPO") ?? "Entraforce/shaahibiryani.github.io";
const BRANCH = Deno.env.get("GITHUB_BRANCH") ?? "main";
const GH_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function syncPublishedPrices(): Promise<string | null> {
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { error } = await service.rpc("web_menu_sync_published");
  return error ? error.message : null;
}

function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function ghGetFile(path: string) {
  // Two requests: the JSON contents API inlines nothing above 1 MB (and
  // index.html is ~1.5 MB), so grab metadata for the sha and raw for the text.
  const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`;
  const headers = (accept: string) => ({
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: accept,
    "User-Agent": "shaahi-publish-menu",
  });
  const [metaRes, rawRes] = await Promise.all([
    fetch(url, { headers: headers("application/vnd.github+json") }),
    fetch(url, { headers: headers("application/vnd.github.raw+json") }),
  ]);
  if (!metaRes.ok) throw new Error(`GitHub read ${path}: ${metaRes.status} ${await metaRes.text()}`);
  if (!rawRes.ok) throw new Error(`GitHub raw read ${path}: ${rawRes.status} ${await rawRes.text()}`);
  const meta = await metaRes.json();
  return { text: await rawRes.text(), sha: meta.sha as string };
}

async function ghPutFile(path: string, content: string, sha: string, message: string) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "shaahi-publish-menu",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: b64encode(content),
        sha,
        branch: BRANCH,
      }),
    },
  );
  if (!res.ok) throw new Error(`GitHub write ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()).commit?.sha as string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!GH_TOKEN) return json({ error: "GITHUB_TOKEN secret not set." }, 500);
    if (!OWNER_EMAIL) return json({ error: "OWNER_EMAIL secret not set." }, 500);

    // ── Only the owner may publish ──
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    const email = userData?.user?.email?.toLowerCase() ?? "";
    if (userErr || email !== OWNER_EMAIL.toLowerCase()) {
      return json({ error: "Not authorized to publish." }, 403);
    }

    // ── Render ──
    const data = await fetchMenuData(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const index = await ghGetFile("index.html");
    const rendered = renderAll(index.text, data);
    if (rendered === index.text) {
      // Site already matches — still align charge prices with what it shows.
      await syncPublishedPrices();
      return json({ changed: false, message: "Menu already up to date — nothing to publish." });
    }

    // ── Commit index.html, then bump the homepage lastmod in sitemap.xml ──
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const commitSha = await ghPutFile(
      "index.html",
      rendered,
      index.sha,
      `Menu update via admin (${today})`,
    );

    // The site now shows the staged prices — make checkout charge them too.
    const syncErr = await syncPublishedPrices();
    if (syncErr) {
      return json({
        changed: true,
        warning: `Site published, but price sync failed: ${syncErr}`,
      });
    }

    try {
      const sitemap = await ghGetFile("sitemap.xml");
      const updated = sitemap.text.replace(
        /(<loc>https:\/\/shaahibiryanidfw\.com\/<\/loc>\s*<lastmod>)[^<]*(<\/lastmod>)/,
        `$1${today}$2`,
      );
      if (updated !== sitemap.text) {
        await ghPutFile("sitemap.xml", updated, sitemap.sha, `Sitemap lastmod ${today}`);
      }
    } catch (_e) {
      // sitemap bump is best-effort; the menu publish already succeeded
    }

    return json({
      changed: true,
      commit: commitSha,
      message: "Published! The website updates in about a minute.",
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
