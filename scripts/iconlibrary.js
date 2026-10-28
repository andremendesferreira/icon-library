"use strict";
/**
 * Iconlibrary: the community icon set. Supporters (people with a valid
 * supporter code from "buy me a coffee") publish icons from the editor; every
 * icon waits for the site owner's review in /admin and, once approved, shows
 * up as the "Iconlibrary" set for everyone, under the MIT license.
 *
 * Table iconlibrary_icons: migrations/002_iconlibrary_icons.sql; edits by the
 * author (pending revisions of approved icons): 004_iconlibrary_revisions.sql
 */
const fs = require("fs");
const path = require("path");
const { sanitizeSvg, SvgError } = require("./svgSafe");

const MAX_CATEGORIES = 3;
const MAX_PENDING = 10;
const LIST_CACHE_MS = 60 * 1000;
const CATEGORIES = new Set(
  JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "public", "json", "iconlibrary-categories.json"), "utf8")),
);

class IconlibraryError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// "Rocket Launch!" → "rocket-launch"
function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanName(text) {
  const name = String(text || "").replace(/\s+/g, " ").trim();
  // Letters of any language, digits, spaces and hyphens
  if (name.length < 2 || name.length > 40 || !/^[\p{L}\p{N} -]+$/u.test(name)) return null;
  const slug = slugify(name);
  return slug.length >= 2 ? { name, slug } : null;
}

function cleanAuthor(text) {
  const author = String(text || "").replace(/\s+/g, " ").trim();
  if (!author) return null;
  // No markup or control characters; shown as text, but kept tidy anyway
  if (author.length > 40 || /[<>"&\p{Cc}]/u.test(author)) throw new IconlibraryError(400, "bad_author");
  return author;
}

/**
 * @param {object} opts
 * @param {object} opts.store       memoryStore() or postgresStore(pool)
 * @param {Function} opts.supporter async (code) → { code, expiresAt } | null for a valid, unexpired code
 * @param {Function} [opts.now]
 */
function createIconlibrary({ store, supporter, now = Date.now }) {
  let cache = null;

  // What a submission or an edit carries, checked and normalized
  function checkIcon({ name, categories, author, svg, license }) {
    if (license !== "MIT") throw new IconlibraryError(400, "license_required");
    const clean = cleanName(name);
    if (!clean) throw new IconlibraryError(400, "bad_name");
    const list = Array.isArray(categories) ? [...new Set(categories)] : [];
    if (!list.length || list.length > MAX_CATEGORIES || !list.every((c) => CATEGORIES.has(c)))
      throw new IconlibraryError(400, "bad_categories", { max: MAX_CATEGORIES });
    const credit = cleanAuthor(author);
    let safe;
    try {
      safe = sanitizeSvg(svg);
    } catch (err) {
      if (err instanceof SvgError) throw new IconlibraryError(400, err.code);
      throw err;
    }
    return { slug: clean.slug, name: clean.name, svg: safe, categories: list, author: credit };
  }

  async function owner(code) {
    const found = await supporter(code);
    if (!found) throw new IconlibraryError(403, "not_supporter");
    return found;
  }

  // An approved icon's pending edit, in the same shape as an icon
  const pendingContent = (icon) => (icon.status === "approved" && icon.revision ? icon.revision : icon);

  return {
    config() {
      return { enabled: true, maxCategories: MAX_CATEGORIES, license: "MIT" };
    },

    // Approved icons, for the site (cached for a minute). A pending edit of
    // an approved icon does not show until it is approved.
    async list() {
      if (cache && cache.until > now()) return cache.icons;
      const icons = (await store.list("approved")).map((i) => ({
        name: i.name,
        slug: i.slug,
        categories: i.categories,
        author: i.author,
        svg: i.svg,
      }));
      cache = { icons, until: now() + LIST_CACHE_MS };
      return icons;
    },

    async submit(input) {
      const { code } = input;
      const icon = checkIcon(input);
      const supporterRow = await owner(code);
      if ((await store.countPending(supporterRow.code)) >= MAX_PENDING)
        throw new IconlibraryError(429, "too_many_pending", { max: MAX_PENDING });
      if (await store.slugInUse(icon.slug)) throw new IconlibraryError(409, "name_taken");
      const id = await store.insert({ ...icon, supporterCode: supporterRow.code });
      return { id, slug: icon.slug, status: "pending" };
    },

    // ── The author's own icons (same supporter code) ──────────────────────
    async mine(code) {
      const supporterRow = await owner(code);
      return (await store.byOwner(supporterRow.code)).map((i) => ({
        id: i.id,
        name: i.name,
        slug: i.slug,
        categories: i.categories,
        author: i.author,
        svg: i.svg,
        status: i.status,
        createdAt: i.createdAt,
        submittedAt: i.submittedAt,
        revision: i.revision
          ? { name: i.revision.name, categories: i.revision.categories, author: i.revision.author, svg: i.revision.svg, submittedAt: i.revision.submittedAt }
          : null,
      }));
    },

    // A pending or rejected icon is changed in place and goes back to the
    // queue; an approved one keeps its live version and gets a pending
    // revision, which replaces it only once approved.
    async edit(id, input) {
      const supporterRow = await owner(input.code);
      const current = await store.byId(id);
      if (!current) throw new IconlibraryError(404, "not_found");
      if (current.supporterCode !== supporterRow.code) throw new IconlibraryError(403, "not_owner");
      const icon = checkIcon(input);
      if (await store.slugInUse(icon.slug, current.id)) throw new IconlibraryError(409, "name_taken");

      if (current.status === "approved") {
        const same =
          icon.name === current.name &&
          icon.svg === current.svg &&
          (icon.author ?? null) === (current.author ?? null) &&
          icon.categories.join() === current.categories.join();
        if (same) {
          // Back to the live version: drop the pending edit, if any
          if (current.revision) await store.clearRevision(current.id);
          return { id: current.id, status: "approved", revision: null };
        }
        if (!current.revision && (await store.countPending(supporterRow.code)) >= MAX_PENDING)
          throw new IconlibraryError(429, "too_many_pending", { max: MAX_PENDING });
        await store.setRevision(current.id, icon);
        return { id: current.id, status: "approved", revision: "pending" };
      }
      if (current.status === "rejected" && (await store.countPending(supporterRow.code)) >= MAX_PENDING)
        throw new IconlibraryError(429, "too_many_pending", { max: MAX_PENDING });
      await store.update(current.id, icon);
      return { id: current.id, status: "pending", revision: null };
    },

    // ── Review (site owner, /admin; moderation API) ────────────────────────
    async get(id) {
      const icon = await store.byId(id);
      if (!icon) throw new IconlibraryError(404, "not_found");
      return icon;
    },

    // "pending" also lists approved icons with a pending edit (they carry
    // "revision"), oldest submission first
    async review(status = "pending") {
      if (!["pending", "approved", "rejected"].includes(status)) throw new IconlibraryError(400, "bad_status");
      const icons = await store.list(status);
      if (status !== "pending") return icons;
      const revisions = await store.withRevision();
      const when = (i) => new Date(i.revision?.submittedAt ?? i.submittedAt ?? i.createdAt).getTime();
      return [...icons, ...revisions].sort((a, b) => when(a) - when(b));
    },

    async decide(id, action, note) {
      const ok =
        action === "delete"
          ? await store.remove(id)
          : await store.setStatus(id, action === "approve" ? "approved" : "rejected", note ? String(note).slice(0, 500) : null);
      if (!ok) throw new IconlibraryError(404, "not_found");
      cache = null;
      return { ok: true };
    },

    // An approved icon's pending edit: approve replaces the live version,
    // reject discards the edit (the live version stays)
    async decideRevision(id, action) {
      const icon = await store.byId(id);
      if (!icon) throw new IconlibraryError(404, "not_found");
      if (!icon.revision) throw new IconlibraryError(409, "no_revision");
      if (action === "approve") await store.applyRevision(icon.id);
      else await store.clearRevision(icon.id);
      cache = null;
      return { ok: true };
    },

    // ── Automated moderation ───────────────────────────────────────────────
    // Everything waiting for a decision: new or edited icons ("icon") and
    // edits of approved icons ("revision"), each with what is waiting
    async queue() {
      return (await this.review("pending")).map((i) => {
        const content = pendingContent(i);
        return {
          id: i.id,
          kind: i.status === "pending" ? "icon" : "revision",
          name: content.name,
          slug: content.slug,
          categories: content.categories,
          author: content.author,
          svg: content.svg,
          createdAt: i.createdAt,
          submittedAt: (i.status === "pending" ? i.submittedAt : i.revision.submittedAt) ?? i.createdAt,
          current: i.status === "pending" ? null : { name: i.name, svg: i.svg },
        };
      });
    },

    // The SVG the moderator must judge: the edit when there is one
    pendingSvg(icon) {
      return pendingContent(icon).svg;
    },

    // Decide whatever is waiting for this icon (the icon itself or its edit)
    async decidePending(id, action, note) {
      const icon = await store.byId(id);
      if (!icon) throw new IconlibraryError(404, "not_found");
      if (icon.status === "pending") return this.decide(id, action, note);
      if (icon.status === "approved" && icon.revision) return this.decideRevision(id, action);
      throw new IconlibraryError(409, "not_pending", { status: icon.status });
    },
  };
}

// The stores keep the pending edit of an approved icon in "revision":
// { name, slug, svg, categories, author, submittedAt }, or null
function memoryStore() {
  const rows = [];
  let next = 1;
  const copy = (r) => ({ ...r, revision: r.revision ? { ...r.revision } : null });
  const find = (id) => rows.find((r) => r.id === Number(id));
  return {
    async list(status) {
      return rows.filter((r) => r.status === status).map(copy);
    },
    async withRevision() {
      return rows.filter((r) => r.status === "approved" && r.revision).map(copy);
    },
    async byId(id) {
      const row = find(id);
      return row ? copy(row) : null;
    },
    async byOwner(code) {
      return rows.filter((r) => r.supporterCode === code).map(copy);
    },
    // Pending icons plus pending edits of this supporter
    async countPending(code) {
      return rows.filter((r) => r.supporterCode === code && (r.status === "pending" || r.revision)).length;
    },
    // Taken by another icon that is pending or approved, or by another
    // icon's pending edit
    async slugInUse(slug, exceptId = null) {
      return rows.some(
        (r) => r.id !== exceptId && ((r.slug === slug && r.status !== "rejected") || r.revision?.slug === slug),
      );
    },
    async insert(row) {
      const id = next++;
      const at = new Date();
      rows.push({ ...row, id, status: "pending", createdAt: at, submittedAt: at, revision: null });
      return id;
    },
    async update(id, icon) {
      const row = find(id);
      if (!row) return false;
      Object.assign(row, icon, { status: "pending", reviewNote: null, reviewedAt: null, submittedAt: new Date(), revision: null });
      return true;
    },
    async setRevision(id, icon) {
      const row = find(id);
      if (!row) return false;
      row.revision = { ...icon, submittedAt: new Date() };
      return true;
    },
    async clearRevision(id) {
      const row = find(id);
      if (!row) return false;
      row.revision = null;
      return true;
    },
    async applyRevision(id) {
      const row = find(id);
      if (!row?.revision) return false;
      const { submittedAt, ...icon } = row.revision;
      Object.assign(row, icon, { submittedAt, reviewedAt: new Date(), revision: null });
      return true;
    },
    async setStatus(id, status, note) {
      const row = find(id);
      if (!row) return false;
      Object.assign(row, { status, reviewNote: note, reviewedAt: new Date() });
      return true;
    },
    async remove(id) {
      const i = rows.findIndex((r) => r.id === Number(id));
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

function postgresStore(pool) {
  const toRow = (r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    svg: r.svg,
    categories: r.categories,
    author: r.author,
    supporterCode: r.supporter_code,
    status: r.status,
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
    revision: r.revision_slug
      ? {
          name: r.revision_name,
          slug: r.revision_slug,
          svg: r.revision_svg,
          categories: r.revision_categories,
          author: r.revision_author,
          submittedAt: r.revision_submitted_at,
        }
      : null,
  });
  // A PostgreSQL integer: a bigger id would be an error 500
  const validId = (id) => {
    const n = Number(id);
    return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
  };
  const nameTaken = (err) => {
    // Same name taken at the same moment by someone else
    if (err.code === "23505") throw new IconlibraryError(409, "name_taken");
    throw err;
  };
  return {
    async list(status) {
      const order = status === "approved" ? "name" : "submitted_at";
      const { rows } = await pool.query(`SELECT * FROM iconlibrary_icons WHERE status = $1 ORDER BY ${order}`, [status]);
      return rows.map(toRow);
    },
    async withRevision() {
      const { rows } = await pool.query(
        "SELECT * FROM iconlibrary_icons WHERE status = 'approved' AND revision_slug IS NOT NULL ORDER BY revision_submitted_at",
      );
      return rows.map(toRow);
    },
    async byId(id) {
      const n = validId(id);
      if (!n) return null;
      const { rows } = await pool.query("SELECT * FROM iconlibrary_icons WHERE id = $1", [n]);
      return rows[0] ? toRow(rows[0]) : null;
    },
    async byOwner(code) {
      const { rows } = await pool.query("SELECT * FROM iconlibrary_icons WHERE supporter_code = $1 ORDER BY created_at DESC", [code]);
      return rows.map(toRow);
    },
    async countPending(code) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM iconlibrary_icons
         WHERE supporter_code = $1 AND (status = 'pending' OR revision_slug IS NOT NULL)`,
        [code],
      );
      return rows[0].n;
    },
    async slugInUse(slug, exceptId = null) {
      const { rows } = await pool.query(
        `SELECT 1 FROM iconlibrary_icons
         WHERE id <> $2 AND ((slug = $1 AND status <> 'rejected') OR revision_slug = $1)`,
        [slug, exceptId ?? 0],
      );
      return rows.length > 0;
    },
    async insert(row) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO iconlibrary_icons (slug, name, svg, categories, author, supporter_code)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [row.slug, row.name, row.svg, row.categories, row.author, row.supporterCode],
        );
        return rows[0].id;
      } catch (err) {
        return nameTaken(err);
      }
    },
    async update(id, icon) {
      try {
        const { rowCount } = await pool.query(
          `UPDATE iconlibrary_icons
           SET slug = $2, name = $3, svg = $4, categories = $5, author = $6, status = 'pending',
               review_note = NULL, reviewed_at = NULL, submitted_at = now(),
               revision_slug = NULL, revision_name = NULL, revision_svg = NULL,
               revision_categories = NULL, revision_author = NULL, revision_submitted_at = NULL
           WHERE id = $1`,
          [validId(id), icon.slug, icon.name, icon.svg, icon.categories, icon.author],
        );
        return rowCount > 0;
      } catch (err) {
        return nameTaken(err);
      }
    },
    async setRevision(id, icon) {
      try {
        const { rowCount } = await pool.query(
          `UPDATE iconlibrary_icons
           SET revision_slug = $2, revision_name = $3, revision_svg = $4, revision_categories = $5,
               revision_author = $6, revision_submitted_at = now()
           WHERE id = $1`,
          [validId(id), icon.slug, icon.name, icon.svg, icon.categories, icon.author],
        );
        return rowCount > 0;
      } catch (err) {
        return nameTaken(err);
      }
    },
    async clearRevision(id) {
      const { rowCount } = await pool.query(
        `UPDATE iconlibrary_icons
         SET revision_slug = NULL, revision_name = NULL, revision_svg = NULL,
             revision_categories = NULL, revision_author = NULL, revision_submitted_at = NULL
         WHERE id = $1`,
        [validId(id)],
      );
      return rowCount > 0;
    },
    async applyRevision(id) {
      try {
        const { rowCount } = await pool.query(
          `UPDATE iconlibrary_icons
           SET slug = revision_slug, name = revision_name, svg = revision_svg,
               categories = revision_categories, author = revision_author,
               submitted_at = revision_submitted_at, reviewed_at = now(),
               revision_slug = NULL, revision_name = NULL, revision_svg = NULL,
               revision_categories = NULL, revision_author = NULL, revision_submitted_at = NULL
           WHERE id = $1 AND revision_slug IS NOT NULL`,
          [validId(id)],
        );
        return rowCount > 0;
      } catch (err) {
        return nameTaken(err);
      }
    },
    async setStatus(id, status, note) {
      try {
        const { rowCount } = await pool.query(
          "UPDATE iconlibrary_icons SET status = $2, review_note = $3, reviewed_at = now() WHERE id = $1",
          [validId(id), status, note],
        );
        return rowCount > 0;
      } catch (err) {
        // Approving a rejected icon whose name was taken in the meantime
        return nameTaken(err);
      }
    },
    async remove(id) {
      const { rowCount } = await pool.query("DELETE FROM iconlibrary_icons WHERE id = $1", [validId(id)]);
      return rowCount > 0;
    },
  };
}

module.exports = {
  IconlibraryError,
  MAX_CATEGORIES,
  MAX_PENDING,
  createIconlibrary,
  memoryStore,
  postgresStore,
  slugify,
};
