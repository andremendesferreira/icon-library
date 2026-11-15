"use strict";
/**
 * The search that learns: once a day an automated agent (the n8n workflow in
 * docs/n8n-sinonimos.json) reads the searches that found nothing
 * (scripts/searchMisses.js), asks a language model for English icon terms that
 * mean the same thing ("lixeira" → trash, bin), and sends them here. The
 * server tests each one against the names and keywords of every icon
 * (scripts/iconIndex.js) with the same rule the page uses for its
 * dictionaries; the ones that find icons become a learned synonym for that
 * language, at once, and the term leaves the list of searches with no
 * results. When none works the term is marked as tried and comes back only
 * after RETRY_DAYS.
 *
 * Learned synonyms are public: GET /api/synonyms/<lang> serves them merged
 * with the hand-written dictionary (public/json/sinonimos/<lang>.json), so
 * only terms searched at least MIN_COUNT times are offered to the agent, and
 * /admin can delete any of them, edit their terms (tested the same way) or
 * ask for a new analysis with a note for the model ("a baby chicken: chick"),
 * which the agent takes first on its next run.
 *
 * Table learned_synonyms and search_misses.tried_at:
 * migrations/008_learned_synonyms.sql
 */
const fs = require("fs");
const path = require("path");
const { normalizeTerm } = require("./searchMisses");
const { countMatches } = require("./iconIndex");

const LANGS = ["en", "es", "fr", "de", "ru", "zh-CN", "pt-BR", "ja"];
const MIN_COUNT = 3;
const RETRY_DAYS = 30;
const MAX_CANDIDATES = 8;
const MAX_TARGETS = 12;
const DICTIONARIES = path.resolve(__dirname, "..", "public", "json", "sinonimos");

class SynonymError extends Error {
  // extra: more fields for the answer ({ tested } when nothing was found)
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const MAX_HINT = 200;

// The owner's note for a new analysis: plain text, one line, at most MAX_HINT
function normalizeHint(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\p{Cc}|\p{Cf}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_HINT);
}

// A candidate as the page will search it: English words in lowercase, joined
// by spaces or hyphens, like the icon names ("arrow-right", "credit card")
function normalizeCandidate(value) {
  const t = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return /^[a-z0-9]+(?:[ -][a-z0-9]+){0,3}$/.test(t) && t.length <= 30 ? t : null;
}

// The hand-written dictionary of a language, or {} when there is none
function readDictionary(lang, dir = DICTIONARIES) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), "utf8"));
  } catch {
    return {};
  }
}

function createSynonymLearning({ store, index, dictionaries = DICTIONARIES, now = Date.now }) {
  return {
    // Terms for the agent. First the learned ones the owner sent back for a
    // new analysis, with the note (hint); then the ones searched at least
    // MIN_COUNT times (all sets together), not tried in the last RETRY_DAYS,
    // most searched first, each with the language it was searched in most
    async pending(limit = 20) {
      const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const reviews = (await store.reviews()).map((r) => ({ term: r.term, count: 0, lang: r.lang, hint: r.hint ?? "" }));
      const again = new Set(reviews.map((r) => r.term));
      const triedBefore = new Date(now() - RETRY_DAYS * 24 * 60 * 60 * 1000);
      const byTerm = new Map();
      for (const row of await store.misses()) {
        if (row.triedAt && row.triedAt > triedBefore) continue;
        const t = byTerm.get(row.term) ?? { term: row.term, count: 0, langs: {} };
        t.count += row.count;
        for (const [l, n] of Object.entries(row.langs || {})) t.langs[l] = (t.langs[l] || 0) + n;
        byTerm.set(row.term, t);
      }
      const misses = [...byTerm.values()]
        .filter((t) => t.count >= MIN_COUNT && !again.has(t.term))
        .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
        .slice(0, max)
        .map((t) => ({
          term: t.term,
          count: t.count,
          lang: Object.entries(t.langs).sort((a, b) => b[1] - a[1])[0]?.[0] || "en",
        }));
      return [...reviews, ...misses].slice(0, max);
    },

    // The agent's candidates for one term. Only a term waiting in the list
    // (searched MIN_COUNT times) can be learned, in a language it was
    // searched in, or a learned one sent back for a new analysis: then the
    // new terms replace the old ones, if any of them finds icons.
    async learn({ term, lang, candidates } = {}) {
      const t = normalizeTerm(term);
      if (!t || !LANGS.includes(lang)) throw new SynonymError(400, "invalid");
      const review = await store.review(lang, t);
      if (!review) {
        const rows = (await store.misses(t)).filter((r) => r.term === t);
        const count = rows.reduce((n, r) => n + r.count, 0);
        if (count < MIN_COUNT || !rows.some((r) => r.langs?.[lang])) throw new SynonymError(404, "not_pending");
      }
      const wanted = [...new Set((Array.isArray(candidates) ? candidates : []).map(normalizeCandidate).filter(Boolean))]
        .filter((c) => c !== t)
        .slice(0, MAX_CANDIDATES);
      const items = await index();
      const tested = wanted.map((c) => ({ term: c, icons: countMatches(items, c) }));
      const found = tested.filter((c) => c.icons > 0);
      if (!found.length) {
        // A new analysis that found nothing keeps the old terms
        if (review) await store.clearReview(lang, t);
        else await store.tried(t, new Date(now()));
        return { ok: true, learned: [], tested };
      }
      // Most icons first: the page tries the dictionary terms in order
      const targets = found.sort((a, b) => b.icons - a.icons).map((c) => c.term);
      const icons = found.reduce((n, c) => n + c.icons, 0);
      await store.save({ lang, term: t, targets: targets.slice(0, MAX_TARGETS), icons, at: new Date(now()), replace: Boolean(review) });
      await store.resolve(t);
      return { ok: true, learned: targets, tested };
    },

    // /admin: the owner's own terms for a word, in the order typed. They
    // replace what was there and go through the same test; the ones that find
    // nothing are dropped, and if none finds anything nothing changes. Works
    // for a word not learned yet too (a search with no results, any count).
    async edit({ lang, term, targets } = {}) {
      const t = normalizeTerm(term);
      if (!t || !LANGS.includes(lang)) throw new SynonymError(400, "invalid");
      const wanted = [...new Set((Array.isArray(targets) ? targets : String(targets ?? "").split(",")).map(normalizeCandidate).filter(Boolean))].slice(
        0,
        MAX_TARGETS,
      );
      if (!wanted.length) throw new SynonymError(400, "invalid");
      const items = await index();
      const tested = wanted.map((c) => ({ term: c, icons: countMatches(items, c) }));
      const found = tested.filter((c) => c.icons > 0);
      if (!found.length) throw new SynonymError(422, "nothing_found", { tested });
      const icons = found.reduce((n, c) => n + c.icons, 0);
      await store.save({ lang, term: t, targets: found.map((c) => c.term), icons, at: new Date(now()), replace: true });
      await store.resolve(t);
      return { ok: true, saved: found.map((c) => c.term), tested };
    },

    // /admin: send a learned word back to the agent with a note
    async review({ lang, term, hint } = {}) {
      const t = normalizeTerm(term);
      if (!t || !LANGS.includes(lang)) throw new SynonymError(400, "invalid");
      if (!(await store.requestReview(lang, t, normalizeHint(hint), new Date(now())))) throw new SynonymError(404, "not_found");
      return { ok: true };
    },

    // /admin: newest first
    async list() {
      return store.list();
    },
    async remove(lang, term) {
      return { ok: true, removed: await store.remove(String(lang ?? ""), String(term ?? "")) };
    },

    // GET /api/synonyms/<lang>: the hand-written dictionary first, then what
    // was learned (a word in both keeps the hand-written terms first)
    async dictionary(lang) {
      const merged = { ...readDictionary(lang, dictionaries) };
      for (const { term, targets } of await store.forLang(lang))
        merged[term] = [...new Set([...(merged[term] ?? []), ...targets])];
      return merged;
    },
  };
}

function memoryStore({ misses = [] } = {}) {
  const learned = new Map();
  return {
    rows: misses,
    async misses(term) {
      return misses.filter((r) => term === undefined || r.term === term).map((r) => ({ ...r }));
    },
    async tried(term, at) {
      for (const r of misses) if (r.term === term) r.triedAt = at;
    },
    async resolve(term) {
      for (let i = misses.length - 1; i >= 0; i--) if (misses[i].term === term) misses.splice(i, 1);
    },
    async save({ lang, term, targets, icons, at, replace = false }) {
      const key = `${lang}\u0000${term}`;
      const old = learned.get(key);
      learned.set(key, {
        lang,
        term,
        targets: [...new Set([...targets, ...(replace ? [] : (old?.targets ?? []))])].slice(0, MAX_TARGETS),
        icons,
        createdAt: old?.createdAt ?? at,
        updatedAt: at,
        hint: null,
        reviewRequestedAt: null,
      });
    },
    async reviews() {
      return [...learned.values()].filter((r) => r.reviewRequestedAt).sort((a, b) => a.reviewRequestedAt - b.reviewRequestedAt);
    },
    async review(lang, term) {
      const r = learned.get(`${lang}\u0000${term}`);
      return r?.reviewRequestedAt ? { hint: r.hint } : null;
    },
    async requestReview(lang, term, hint, at) {
      const r = learned.get(`${lang}\u0000${term}`);
      if (!r) return false;
      Object.assign(r, { hint, reviewRequestedAt: at });
      return true;
    },
    async clearReview(lang, term) {
      const r = learned.get(`${lang}\u0000${term}`);
      if (r) Object.assign(r, { hint: null, reviewRequestedAt: null });
    },
    async forLang(lang) {
      return [...learned.values()].filter((r) => r.lang === lang);
    },
    async list() {
      return [...learned.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((r) => ({ ...r }));
    },
    async remove(lang, term) {
      return learned.delete(`${lang}\u0000${term}`);
    },
  };
}

function postgresStore(pool) {
  return {
    async misses(term) {
      const { rows } = await pool.query(
        term === undefined
          ? "SELECT term, count, langs, tried_at FROM search_misses"
          : "SELECT term, count, langs, tried_at FROM search_misses WHERE term = $1",
        term === undefined ? [] : [term],
      );
      return rows.map((r) => ({ term: r.term, count: r.count, langs: r.langs, triedAt: r.tried_at }));
    },
    async tried(term, at) {
      await pool.query("UPDATE search_misses SET tried_at = $2 WHERE term = $1", [term, at]);
    },
    async resolve(term) {
      await pool.query("DELETE FROM search_misses WHERE term = $1", [term]);
    },
    async save({ lang, term, targets, icons, at, replace = false }) {
      // Terms learned before stay, after the new ones, unless replaced (an
      // edit, a new analysis). One agent a day: no race worth a lock
      const { rows } = replace
        ? { rows: [] }
        : await pool.query("SELECT targets FROM learned_synonyms WHERE lang = $1 AND term = $2", [lang, term]);
      const merged = [...new Set([...targets, ...(rows[0]?.targets ?? [])])].slice(0, MAX_TARGETS);
      await pool.query(
        `INSERT INTO learned_synonyms (lang, term, targets, icons, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $5)
         ON CONFLICT (lang, term) DO UPDATE SET targets = EXCLUDED.targets, icons = EXCLUDED.icons,
           updated_at = EXCLUDED.updated_at, review_hint = NULL, review_requested_at = NULL`,
        [lang, term, JSON.stringify(merged), icons, at],
      );
    },
    async reviews() {
      const { rows } = await pool.query(
        "SELECT lang, term, review_hint FROM learned_synonyms WHERE review_requested_at IS NOT NULL ORDER BY review_requested_at LIMIT 100",
      );
      return rows.map((r) => ({ lang: r.lang, term: r.term, hint: r.review_hint }));
    },
    async review(lang, term) {
      const { rows } = await pool.query(
        "SELECT review_hint FROM learned_synonyms WHERE lang = $1 AND term = $2 AND review_requested_at IS NOT NULL",
        [lang, term],
      );
      return rows[0] ? { hint: rows[0].review_hint } : null;
    },
    async requestReview(lang, term, hint, at) {
      const { rowCount } = await pool.query(
        "UPDATE learned_synonyms SET review_hint = $3, review_requested_at = $4 WHERE lang = $1 AND term = $2",
        [lang, term, hint, at],
      );
      return rowCount > 0;
    },
    async clearReview(lang, term) {
      await pool.query("UPDATE learned_synonyms SET review_hint = NULL, review_requested_at = NULL WHERE lang = $1 AND term = $2", [lang, term]);
    },
    async forLang(lang) {
      const { rows } = await pool.query("SELECT term, targets FROM learned_synonyms WHERE lang = $1", [lang]);
      return rows;
    },
    async list() {
      const { rows } = await pool.query(
        "SELECT lang, term, targets, icons, created_at, updated_at, review_hint, review_requested_at FROM learned_synonyms ORDER BY updated_at DESC LIMIT 1000",
      );
      return rows.map((r) => ({
        lang: r.lang,
        term: r.term,
        targets: r.targets,
        icons: r.icons,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        hint: r.review_hint,
        reviewRequestedAt: r.review_requested_at,
      }));
    },
    async remove(lang, term) {
      const { rowCount } = await pool.query("DELETE FROM learned_synonyms WHERE lang = $1 AND term = $2", [lang, term]);
      return rowCount > 0;
    },
  };
}

module.exports = {
  LANGS,
  MIN_COUNT,
  RETRY_DAYS,
  SynonymError,
  createSynonymLearning,
  memoryStore,
  normalizeCandidate,
  normalizeHint,
  postgresStore,
  readDictionary,
};
