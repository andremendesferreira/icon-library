"use strict";
/**
 * Names and keywords of every icon, on the server, so a learned synonym can be
 * tested before it goes live (scripts/synonymLearning.js). The page searches
 * in the browser; this is the same data, read once a day at most:
 *
 *   Lucide     tags.json from unpkg (every icon has an entry), at the version
 *              pinned in public/js/models/iconSets.js
 *   Tabler     icons.json from unpkg (names, keywords; outline and filled)
 *   Emoji      data-by-emoji.json from unpkg (slug names, no keywords)
 *   Feather,   public/json/icons-categories.json (names) and
 *   Bootstrap  public/json/icons-tags.json (keywords)
 *   Iconlibrary the approved community icons (name and categories)
 *
 * Lucide is required: without it most candidates would look dead, so a failed
 * download throws and the caller tries again later. The others are optional.
 */
const fs = require("fs");
const path = require("path");

const PUBLIC = path.resolve(__dirname, "..", "public");
const DAY = 24 * 60 * 60 * 1000;

function pinnedVersions(file = path.join(PUBLIC, "js", "models", "iconSets.js")) {
  const text = fs.readFileSync(file, "utf8");
  const version = (key) => new RegExp(`${key}:\\s*"([\\d.]+)"`).exec(text)?.[1];
  return { lucide: version("lucide"), tabler: version("tabler"), emoji: version("emoji") };
}

async function defaultFetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const readLocal = (name) => JSON.parse(fs.readFileSync(path.join(PUBLIC, "json", name), "utf8"));

// One entry per icon: { name: "arrow-right", tags: ["direction", …] }, all
// lowercase, words of the name joined by hyphens
const entry = (name, tags = []) => ({
  name: String(name).toLowerCase().trim().replace(/[\s_]+/g, "-"),
  tags: (Array.isArray(tags) ? tags : []).map((t) => String(t).toLowerCase().trim()).filter(Boolean),
});

async function buildIndex({ fetchJson = defaultFetchJson, community = async () => [], versions = pinnedVersions() } = {}) {
  if (!versions.lucide) throw new Error("Lucide version not found in iconSets.js");
  const items = [];
  const lucide = await fetchJson(`https://unpkg.com/lucide-static@${versions.lucide}/tags.json`);
  for (const [name, tags] of Object.entries(lucide)) items.push(entry(name, tags));

  const categories = readLocal("icons-categories.json");
  let tags = {};
  try {
    tags = readLocal("icons-tags.json");
  } catch {}
  for (const set of ["feather", "bootstrap"])
    for (const name of Object.keys(categories[set] || {})) items.push(entry(name, tags[set]?.[name]));

  try {
    if (!versions.tabler) throw new Error("Tabler version not found in iconSets.js");
    const tabler = await fetchJson(`https://unpkg.com/@tabler/icons@${versions.tabler}/icons.json`);
    for (const [name, info] of Object.entries(tabler)) items.push(entry(name, info?.tags));
  } catch (err) {
    console.warn("[icon-index] Tabler names unavailable:", err.message);
  }
  try {
    const emoji = await fetchJson(`https://unpkg.com/unicode-emoji-json@${versions.emoji}/data-by-emoji.json`);
    for (const info of Object.values(emoji)) if (info?.slug) items.push(entry(info.slug));
  } catch (err) {
    console.warn("[icon-index] emoji names unavailable:", err.message);
  }
  try {
    for (const icon of await community()) items.push(entry(icon.slug || icon.name, icon.categories));
  } catch (err) {
    console.warn("[icon-index] Iconlibrary names unavailable:", err.message);
  }
  return items;
}

// The page's rule for a dictionary term (acertoDoSinonimo in
// public/js/models/IconModel.js): every word of the term is a whole word of
// the name, or the term is exactly one of the keywords
function matches(item, term) {
  const wanted = term.split(/[-\s]+/).filter(Boolean);
  const parts = item.name.split("-");
  return wanted.every((w) => parts.includes(w)) || item.tags.includes(term);
}

function countMatches(items, term) {
  let n = 0;
  for (const item of items) if (matches(item, term)) n++;
  return n;
}

// The index kept in memory for a day; callers arriving while it is being
// built share the same download. A failure is not kept.
function createIconIndex({ ttl = DAY, now = Date.now, ...options } = {}) {
  let cached = null;
  let building = null;
  return async () => {
    if (cached && cached.until > now()) return cached.items;
    if (!building)
      building = buildIndex(options)
        .then((items) => {
          cached = { items, until: now() + ttl };
          return items;
        })
        .finally(() => {
          building = null;
        });
    return building;
  };
}

module.exports = { buildIndex, countMatches, createIconIndex, matches, pinnedVersions };
