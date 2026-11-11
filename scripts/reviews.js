"use strict";
/**
 * Supporter reviews: a 1–5 star rating and a comment about Icon Library,
 * shown on the About page after moderation.
 *
 * - Only a valid, unexpired supporter code can send one (the same code as
 *   Iconlibrary), and there is one review per code. Sending again replaces
 *   it; when the review is already live, the new text waits in "pending" and
 *   the approved one stays on the page until a moderator decides.
 * - The person picks the name shown (1–40 characters) and, optionally, a
 *   photo. A login with GitHub, Google or Microsoft (scripts/oauth.js) only
 *   fills in name and photo and marks the review as verified by that
 *   provider; its token is never kept.
 * - Photos are always redrawn as a 96×96 PNG on the server (avatarPng):
 *   metadata such as a phone's location goes away, and the page never loads
 *   an image from another site.
 * - Moderation: /admin and the moderation API (n8n → Telegram).
 *
 * Table reviews: migrations/006_reviews.sql
 */
const crypto = require("crypto");

const PROVIDERS = ["anonymous", "github", "google", "microsoft"];
const MIN_COMMENT = 10;
const MAX_COMMENT = 600;
const MAX_NAME = 40;
const AVATAR = 96;
// The page shrinks a photo before sending it; this is what arrives (base64)
const MAX_PHOTO = 400 * 1024;
const LANGS = ["en", "es", "fr", "de", "ru", "zh-CN", "pt-BR", "ja"];
// A flood of reviews must not fill the database
const MAX_PENDING = 300;

class ReviewError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// Bidirectional controls (U+202A–202E, U+2066–2069, U+200E/F) would let a
// name or comment look like something else; zero-width joiners stay (emoji)
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

// Text from the page: no control characters (line breaks allowed in the
// comment), trimmed, cut by code point (as char_length in the database), never
// in the middle of a surrogate pair
function clean(value, max, { lines = false } = {}) {
  let text = String(value ?? "").replace(BIDI, "");
  text = lines
    ? text.replace(/\r\n?/g, "\n").replace(/[^\P{Cc}\n]/gu, "").replace(/\n{3,}/g, "\n\n")
    : text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ");
  return [...text.trim()].slice(0, max).join("");
}
const length = (text) => [...text].length;

// Only PNG and JPEG reach the renderer: the page converts anything else
// (WebP, HEIC…) to JPEG in a canvas before sending
function imageType(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  return null;
}

// Width and height from the header, without decoding: a small file can
// declare a huge image (16000×16000 in 250 KB) and the decoder would need
// gigabytes. null when the header cannot be read.
function imageSize(buf) {
  const type = imageType(buf);
  if (type === "png") return buf.length >= 24 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null;
  if (type !== "jpeg") return null;
  // Walk the JPEG markers up to a start-of-frame (SOF0–SOF15, except DHT,
  // JPG and DAC)
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

let Resvg;
// Any PNG or JPEG up to maxSide pixels → a square 96×96 PNG (the middle of
// the photo, cropped). Returns null when the image cannot be read or is too
// large. The page sends at most 256 px.
function avatarPng(buf, { maxSide = 1024 } = {}) {
  const type = imageType(buf);
  if (!type) return null;
  const size = imageSize(buf);
  if (!size || !size.w || !size.h || size.w > maxSide || size.h > maxSide) return null;
  if (Resvg === undefined) {
    try {
      ({ Resvg } = require("@resvg/resvg-js"));
    } catch {
      Resvg = null;
    }
  }
  if (!Resvg) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${AVATAR}" height="${AVATAR}"><image width="${AVATAR}" height="${AVATAR}" preserveAspectRatio="xMidYMid slice" href="data:image/${type};base64,${buf.toString("base64")}"/></svg>`;
  try {
    const out = new Resvg(svg).render();
    // An image the renderer could not decode comes out fully transparent
    let visible = false;
    for (let i = 3; i < out.pixels.length; i += 4)
      if (out.pixels[i]) {
        visible = true;
        break;
      }
    return visible ? out.asPng() : null;
  } catch {
    return null;
  }
}

// "data:image/jpeg;base64,…" from the page → Buffer
function photoFromDataUrl(value) {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(value));
  if (!m) throw new ReviewError(400, "bad_image");
  if (m[2].length > (MAX_PHOTO * 4) / 3 + 4) throw new ReviewError(413, "image_too_large");
  return Buffer.from(m[2], "base64");
}

const providerHash = (provider, id) => crypto.createHash("sha256").update(`${provider}:${id}`).digest("hex");

/**
 * @param {object} opts
 * @param {object} opts.store       memoryStore() or postgresStore(pool)
 * @param {Function} opts.supporter code → supporter row or null (scripts/coffee.js)
 * @param {Function} [opts.identity] ticket → { provider, providerHash, name, avatar } once (scripts/oauth.js)
 * @param {Function} [opts.render]  photo Buffer → PNG Buffer or null (tests replace it)
 */
function createReviews({ store, supporter, identity = () => null, render = avatarPng, now = Date.now }) {
  // What the public sees of an approved review
  const publicView = (r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    name: r.displayName,
    provider: r.provider,
    avatar: r.avatar ? `/api/reviews/${r.id}/avatar.png?v=${r.decidedAt ? new Date(r.decidedAt).getTime() : r.id}` : null,
    lang: r.lang,
    date: r.decidedAt || r.createdAt,
  });
  // What waits for a decision: the edit, when the live review was edited
  const pendingContent = (r) => (r.pending ? { ...r, ...r.pending, avatar: r.pending.avatar } : r);

  return {
    // browser: the login cookie of this browser (scripts/oauth.js)
    async submit(body = {}, { browser = null } = {}) {
      if (String(body.website ?? "").trim()) return { ok: true, status: "pending" };
      const owner = await supporter(body.code);
      if (!owner) throw new ReviewError(403, "not_supporter");
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError(400, "bad_rating");
      const comment = clean(body.comment, MAX_COMMENT + 1, { lines: true });
      if (length(comment) < MIN_COMMENT) throw new ReviewError(400, "too_short");
      if (length(comment) > MAX_COMMENT) throw new ReviewError(400, "too_long");
      const displayName = clean(body.name, MAX_NAME + 1);
      if (!displayName) throw new ReviewError(400, "no_name");
      if (length(displayName) > MAX_NAME) throw new ReviewError(400, "name_too_long");
      if (body.consent !== true) throw new ReviewError(400, "consent");
      const lang = LANGS.includes(body.lang) ? body.lang : "en";

      // A new photo first: if it fails, the login ticket is still unused
      let upload;
      if (typeof body.photo === "string" && body.photo !== "keep") {
        upload = render(photoFromDataUrl(body.photo));
        if (!upload) throw new ReviewError(400, "bad_image");
      }
      // How the person appears: a new login (the ticket from the callback,
      // used once, only from the browser that signed in), what the current
      // review has, or anonymous
      const existing = await store.bySupporter(owner.code);
      const current = existing && pendingContent(existing);
      let provider = "anonymous";
      let hash = null;
      let avatar = null;
      if (body.ticket) {
        const id = identity(String(body.ticket), browser);
        if (!id) throw new ReviewError(410, "login_expired");
        provider = id.provider;
        hash = id.providerHash;
        avatar = id.avatar || null;
      } else if (current) {
        avatar = current.avatar ?? null;
        if (body.provider !== "anonymous") {
          provider = current.provider;
          hash = current.providerHash;
        }
      }
      // photo: "keep" (or absent) leaves the one above; null removes it; a
      // data URL replaces it
      if (body.photo === null) avatar = null;
      else if (upload) avatar = upload;

      if (!existing && (await store.countPending()) >= MAX_PENDING) throw new ReviewError(503, "full");
      const fields = { rating, comment, displayName, provider, providerHash: hash, avatar, lang };
      const row = await store.save(owner.code, fields, new Date(now()));
      return { ok: true, status: row.status === "approved" ? "edit_pending" : "pending" };
    },

    // The person's own review, to edit it (the code goes in the body)
    async mine(code) {
      const owner = await supporter(code);
      if (!owner) throw new ReviewError(403, "not_supporter");
      const r = await store.bySupporter(owner.code);
      if (!r) return null;
      const c = pendingContent(r);
      return {
        rating: c.rating,
        comment: c.comment,
        name: c.displayName,
        provider: c.provider,
        hasPhoto: Boolean(c.avatar),
        status: r.pending ? "edit_pending" : r.status,
      };
    },

    // Approved reviews, newest first, with the average
    async list() {
      const rows = await store.list("approved");
      const total = rows.length;
      const average = total ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10 : null;
      return { total, average, reviews: rows.map(publicView) };
    },

    // Photo of an approved review (public), or of what is pending (moderation)
    async avatar(id, { pending = false } = {}) {
      const r = await store.byId(id);
      if (!r) return null;
      if (pending) return pendingContent(r).avatar ?? null;
      return r.status === "approved" ? r.avatar : null;
    },

    // ── Moderation ─────────────────────────────────────────────────────────
    // status "pending" also lists approved reviews with an edit waiting
    async review(status = "pending") {
      if (!["pending", "approved", "rejected"].includes(status)) throw new ReviewError(400, "bad_status");
      const rows = await store.list(status);
      return rows.map((r) => {
        const c = status === "pending" ? pendingContent(r) : r;
        return {
          id: r.id,
          supporterCode: r.supporter,
          rating: c.rating,
          comment: c.comment,
          name: c.displayName,
          provider: c.provider,
          verified: Boolean(c.providerHash),
          hasPhoto: Boolean(c.avatar),
          lang: c.lang,
          status: r.status,
          edit: Boolean(r.pending),
          current: r.pending ? { rating: r.rating, comment: r.comment, name: r.displayName } : null,
          note: r.note,
          createdAt: r.createdAt,
          submittedAt: r.submittedAt,
          decidedAt: r.decidedAt,
        };
      });
    },

    // For the moderation API (n8n): same list, without the supporter code
    async queue() {
      return (await this.review("pending")).map(({ supporterCode, ...r }) => ({
        ...r,
        avatar: r.hasPhoto ? `/api/moderation/reviews/${r.id}/avatar.png` : null,
      }));
    },

    // approve | reject | delete. seen: the version the moderator saw
    // (submittedAt, ISO or ms); the store only changes that version, in the
    // same statement, so an edit sent after it answers 409 "changed".
    // onlyPending: the automated moderator never undoes a decision nor
    // deletes a live review.
    async decide(id, action, { note = null, seen = null, onlyPending = false } = {}) {
      const r = await store.byId(id);
      if (!r) throw new ReviewError(404, "not_found");
      const waiting = r.status === "pending" || Boolean(r.pending);
      if (onlyPending && !waiting) throw new ReviewError(409, "not_pending", { status: r.status });
      let version = null;
      if (seen != null && seen !== "") {
        const ms = typeof seen === "number" || /^\d+$/.test(String(seen)) ? Number(seen) : Date.parse(seen);
        if (!Number.isFinite(ms)) throw new ReviewError(400, "bad_version");
        version = Math.floor(ms / 1000);
      }
      const reason = note == null ? null : clean(note, 300) || null;
      if (!["approve", "reject", "delete"].includes(action)) throw new ReviewError(400, "bad_action");
      if (action === "delete" && onlyPending && r.status === "approved") throw new ReviewError(409, "approved");
      const done =
        action === "delete"
          ? await store.remove(r.id, version)
          : action === "approve"
            ? await store.approve(r.id, new Date(now()), version)
            : await store.reject(r.id, reason, new Date(now()), version);
      if (!done) throw new ReviewError(409, "changed");
      return { ok: true };
    },
  };
}

// ── Stores ─────────────────────────────────────────────────────────────────
// Row: { id, supporter, rating, comment, displayName, provider, providerHash,
//        avatar (Buffer|null), lang, status, note, pending (fields|null),
//        createdAt, submittedAt, decidedAt }
function memoryStore() {
  const rows = [];
  let next = 1;
  const copy = (r) => r && { ...r, pending: r.pending && { ...r.pending } };
  const find = (id, version) =>
    rows.find((x) => x.id === Number(id) && (version == null || Math.floor(x.submittedAt.getTime() / 1000) === version));
  return {
    async bySupporter(code) {
      return copy(rows.find((r) => r.supporter === code));
    },
    async byId(id) {
      return copy(rows.find((r) => r.id === Number(id)));
    },
    async countPending() {
      return rows.filter((r) => r.status === "pending" || r.pending).length;
    },
    async list(status) {
      const sel =
        status === "pending"
          ? rows.filter((r) => r.status === "pending" || r.pending).sort((a, b) => a.submittedAt - b.submittedAt)
          : rows.filter((r) => r.status === status).sort((a, b) => (b.decidedAt || b.createdAt) - (a.decidedAt || a.createdAt));
      return sel.map(copy);
    },
    async save(code, fields, when) {
      let r = rows.find((x) => x.supporter === code);
      if (r && r.status === "approved") {
        r.pending = { ...fields };
        r.submittedAt = when;
      } else if (r) {
        Object.assign(r, fields, { status: "pending", note: null, submittedAt: when, decidedAt: null });
      } else {
        r = { id: next++, supporter: code, ...fields, status: "pending", note: null, pending: null, createdAt: when, submittedAt: when, decidedAt: null };
        rows.push(r);
      }
      return copy(r);
    },
    // version: submittedAt in seconds, or null for any version. Each
    // returns false when nothing matched.
    async approve(id, when, version = null) {
      const r = find(id, version);
      if (!r) return false;
      if (r.pending) Object.assign(r, r.pending, { pending: null });
      Object.assign(r, { status: "approved", note: null, decidedAt: when });
      return true;
    },
    async reject(id, note, when, version = null) {
      const r = find(id, version);
      if (!r) return false;
      // Rejecting an edit keeps the live review as it was
      if (r.pending) r.pending = null;
      else Object.assign(r, { status: "rejected", note, decidedAt: when });
      return true;
    },
    async remove(id, version = null) {
      const r = find(id, version);
      if (!r) return false;
      rows.splice(rows.indexOf(r), 1);
      return true;
    },
  };
}

function postgresStore(pool) {
  const toRow = (r) =>
    r && {
      id: r.id,
      supporter: r.supporter,
      rating: r.rating,
      comment: r.comment,
      displayName: r.display_name,
      provider: r.provider,
      providerHash: r.provider_hash,
      avatar: r.avatar,
      lang: r.lang,
      status: r.status,
      note: r.note,
      pending: r.pending_json
        ? { ...r.pending_json, avatar: r.pending_json.avatar ? Buffer.from(r.pending_json.avatar, "base64") : null }
        : null,
      createdAt: r.created_at,
      submittedAt: r.submitted_at,
      decidedAt: r.decided_at,
    };
  const one = async (sql, args) => toRow((await pool.query(sql, args)).rows[0]);
  return {
    bySupporter: (code) => one("SELECT * FROM reviews WHERE supporter = $1", [code]),
    byId: (id) => one("SELECT * FROM reviews WHERE id = $1", [Number(id)]),
    async countPending() {
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM reviews WHERE status = 'pending' OR pending_json IS NOT NULL");
      return rows[0].n;
    },
    async list(status) {
      const sql =
        status === "pending"
          ? "SELECT * FROM reviews WHERE status = 'pending' OR pending_json IS NOT NULL ORDER BY submitted_at"
          : "SELECT * FROM reviews WHERE status = $1 ORDER BY coalesce(decided_at, created_at) DESC";
      const { rows } = await pool.query(sql, status === "pending" ? [] : [status]);
      return rows.map(toRow);
    },
    async save(code, f, when) {
      const pending = { ...f, avatar: f.avatar ? f.avatar.toString("base64") : null };
      // Approved: the edit waits in pending_json. Otherwise the row itself
      // changes and goes back to pending.
      return one(
        `INSERT INTO reviews (supporter, rating, comment, display_name, provider, provider_hash, avatar, lang, submitted_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         ON CONFLICT (supporter) DO UPDATE SET
           pending_json = CASE WHEN reviews.status = 'approved' THEN $10::jsonb END,
           rating       = CASE WHEN reviews.status = 'approved' THEN reviews.rating ELSE EXCLUDED.rating END,
           comment      = CASE WHEN reviews.status = 'approved' THEN reviews.comment ELSE EXCLUDED.comment END,
           display_name = CASE WHEN reviews.status = 'approved' THEN reviews.display_name ELSE EXCLUDED.display_name END,
           provider     = CASE WHEN reviews.status = 'approved' THEN reviews.provider ELSE EXCLUDED.provider END,
           provider_hash = CASE WHEN reviews.status = 'approved' THEN reviews.provider_hash ELSE EXCLUDED.provider_hash END,
           avatar       = CASE WHEN reviews.status = 'approved' THEN reviews.avatar ELSE EXCLUDED.avatar END,
           lang         = CASE WHEN reviews.status = 'approved' THEN reviews.lang ELSE EXCLUDED.lang END,
           note         = CASE WHEN reviews.status = 'approved' THEN reviews.note END,
           decided_at   = CASE WHEN reviews.status = 'approved' THEN reviews.decided_at END,
           status       = CASE WHEN reviews.status = 'approved' THEN 'approved' ELSE 'pending' END,
           submitted_at = EXCLUDED.submitted_at
         RETURNING *`,
        [code, f.rating, f.comment, f.displayName, f.provider, f.providerHash, f.avatar, f.lang, when, JSON.stringify(pending)],
      );
    },
    // version: submittedAt in seconds, or null for any version. The check is
    // in the same statement, so an edit arriving meanwhile is never approved
    // unseen. Each returns false when nothing matched.
    async approve(id, when, version = null) {
      const { rowCount } = await pool.query(
        `UPDATE reviews SET
           rating        = coalesce((pending_json->>'rating')::smallint, rating),
           comment       = coalesce(pending_json->>'comment', comment),
           display_name  = coalesce(pending_json->>'displayName', display_name),
           provider      = coalesce(pending_json->>'provider', provider),
           provider_hash = CASE WHEN pending_json IS NULL THEN provider_hash ELSE pending_json->>'providerHash' END,
           avatar        = CASE WHEN pending_json IS NULL THEN avatar ELSE decode(pending_json->>'avatar', 'base64') END,
           lang          = coalesce(pending_json->>'lang', lang),
           pending_json  = NULL, status = 'approved', note = NULL, decided_at = $2
         WHERE id = $1 AND ($3::bigint IS NULL OR floor(extract(epoch FROM submitted_at))::bigint = $3)`,
        [Number(id), when, version],
      );
      return rowCount > 0;
    },
    async reject(id, note, when, version = null) {
      const { rowCount } = await pool.query(
        `UPDATE reviews SET
           status     = CASE WHEN pending_json IS NULL THEN 'rejected' ELSE status END,
           note       = CASE WHEN pending_json IS NULL THEN $2 ELSE note END,
           decided_at = CASE WHEN pending_json IS NULL THEN $3 ELSE decided_at END,
           pending_json = NULL
         WHERE id = $1 AND ($4::bigint IS NULL OR floor(extract(epoch FROM submitted_at))::bigint = $4)`,
        [Number(id), note, when, version],
      );
      return rowCount > 0;
    },
    async remove(id, version = null) {
      const { rowCount } = await pool.query(
        "DELETE FROM reviews WHERE id = $1 AND ($2::bigint IS NULL OR floor(extract(epoch FROM submitted_at))::bigint = $2)",
        [Number(id), version],
      );
      return rowCount > 0;
    },
  };
}

module.exports = {
  AVATAR,
  MAX_COMMENT,
  MAX_NAME,
  MIN_COMMENT,
  PROVIDERS,
  ReviewError,
  avatarPng,
  createReviews,
  imageSize,
  imageType,
  memoryStore,
  postgresStore,
  providerHash,
};
