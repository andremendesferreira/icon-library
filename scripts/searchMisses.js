"use strict";
/**
 * Searches with no results: when a search finds no icon in the chosen set, the
 * page sends the term, the set and the language. The server keeps one counter
 * per term and set, never the IP or anything else about the visitor, so the
 * owner can see in /admin which icons people look for and cannot find.
 *
 * Terms that look like personal data (an e-mail, a link, a long number) or
 * that are too long are dropped instead of stored.
 *
 * Table search_misses: migrations/007_search_misses.sql
 */
const SETS = ["lucide", "feather", "bootstrap", "emoji", "iconlibrary"];
const LANGS = ["en", "es", "fr", "de", "ru", "zh-CN", "pt-BR", "ja"];
const MAX_TERM = 40;
// The table stays small: past this many different terms, new ones are ignored
const MAX_ROWS = 5000;

// The term as it is stored: lowercase, single spaces, trimmed; null when it
// must not be kept
function normalizeTerm(value) {
  const term = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Cc}|\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if ([...term].length < 2 || [...term].length > MAX_TERM) return null;
  // Personal data or noise: e-mail, link, long numbers, code
  if (/@|https?:|www\.|\d{5,}|[<>{}\\]/.test(term)) return null;
  // Letters (any script), digits, spaces and a few separators only
  if (!/^[\p{L}\p{M}\p{N} '’.\-_/&+#]+$/u.test(term)) return null;
  return term;
}

function createSearchMisses({ store, now = Date.now }) {
  return {
    // Fire and forget from the page: invalid input is ignored, not an error
    async record({ term, set, lang } = {}) {
      const t = normalizeTerm(term);
      if (!t || !SETS.includes(set)) return { ok: true, stored: false };
      const l = LANGS.includes(lang) ? lang : "en";
      const stored = await store.bump({ term: t, set, lang: l, at: new Date(now()), maxRows: MAX_ROWS });
      return { ok: true, stored };
    },
    // /admin: most searched first
    async top(limit = 200) {
      return store.top(Math.min(Math.max(Number(limit) || 200, 1), 1000));
    },
    async remove(term, set) {
      return { ok: true, removed: await store.remove(String(term ?? ""), String(set ?? "")) };
    },
  };
}

function memoryStore() {
  const rows = new Map();
  return {
    async bump({ term, set, lang, at, maxRows }) {
      const key = `${set}\u0000${term}`;
      const row = rows.get(key);
      if (row) {
        row.count++;
        row.lastSeen = at;
        row.langs[lang] = (row.langs[lang] || 0) + 1;
        return true;
      }
      if (rows.size >= maxRows) return false;
      rows.set(key, { term, set, count: 1, langs: { [lang]: 1 }, firstSeen: at, lastSeen: at });
      return true;
    },
    async top(limit) {
      return [...rows.values()]
        .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
        .slice(0, limit)
        .map((r) => ({ ...r, langs: { ...r.langs } }));
    },
    async remove(term, set) {
      return rows.delete(`${set}\u0000${term}`);
    },
  };
}

function postgresStore(pool) {
  return {
    async bump({ term, set, lang, at, maxRows }) {
      // Existing term: count it. New term: only while the table has room
      const { rowCount } = await pool.query(
        `INSERT INTO search_misses (term, icon_set, count, langs, first_seen, last_seen)
         SELECT $1, $2, 1, jsonb_build_object($3::text, 1), $4, $4
         WHERE (SELECT count(*) FROM search_misses) < $5
            OR EXISTS (SELECT 1 FROM search_misses WHERE term = $1 AND icon_set = $2)
         ON CONFLICT (term, icon_set) DO UPDATE SET
           count = search_misses.count + 1,
           langs = jsonb_set(search_misses.langs, ARRAY[$3::text],
                   to_jsonb(coalesce((search_misses.langs->>$3::text)::int, 0) + 1)),
           last_seen = EXCLUDED.last_seen`,
        [term, set, lang, at, maxRows],
      );
      return rowCount > 0;
    },
    async top(limit) {
      const { rows } = await pool.query(
        "SELECT term, icon_set, count, langs, first_seen, last_seen FROM search_misses ORDER BY count DESC, last_seen DESC LIMIT $1",
        [limit],
      );
      return rows.map((r) => ({ term: r.term, set: r.icon_set, count: r.count, langs: r.langs, firstSeen: r.first_seen, lastSeen: r.last_seen }));
    },
    async remove(term, set) {
      const { rowCount } = await pool.query("DELETE FROM search_misses WHERE term = $1 AND icon_set = $2", [term, set]);
      return rowCount > 0;
    },
  };
}

module.exports = { MAX_TERM, SETS, createSearchMisses, memoryStore, normalizeTerm, postgresStore };
