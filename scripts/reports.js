"use strict";
/**
 * Bug reports: the "Report a bug" form in the site footer. Anyone can send
 * one, no account needed; the site owner reads them in /admin and marks them
 * resolved. The form also links to GitHub Issues for people who prefer it.
 *
 * Kept: the message, an optional e-mail for a reply, and what the page sends
 * along (address, language, browser, screen size). The IP is not stored.
 *
 * Table bug_reports: migrations/003_bug_reports.sql
 */

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 2000;
const MAX_OPEN = 500;

class ReportError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// Text from the page: no control characters (except line breaks in the
// message), trimmed and cut to a size
function clean(value, max, { lines = false } = {}) {
  let text = String(value ?? "");
  text = lines ? text.replace(/\r\n?/g, "\n").replace(/[^\P{Cc}\n\t]/gu, "") : text.replace(/\p{Cc}/gu, " ");
  return text.trim().slice(0, max);
}

function cleanEmail(value) {
  const email = clean(value, 254);
  if (!email) return null;
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) throw new ReportError(400, "bad_email");
  return email;
}

/**
 * @param {object} opts
 * @param {object} opts.store memoryStore() or postgresStore(pool)
 */
function createReports({ store }) {
  return {
    config() {
      return { enabled: true, minMessage: MIN_MESSAGE, maxMessage: MAX_MESSAGE };
    },

    // website: a field hidden from people; bots that fill it get a normal
    // answer and nothing is saved
    async submit({ message, email, page, lang, browser, screen, website } = {}) {
      const text = clean(message, MAX_MESSAGE + 1, { lines: true });
      if (text.length < MIN_MESSAGE) throw new ReportError(400, "too_short");
      if (text.length > MAX_MESSAGE) throw new ReportError(400, "too_long");
      const contact = cleanEmail(email);
      if (clean(website, 200)) return { ok: true };
      // A flood of reports must not fill the database
      if ((await store.countOpen()) >= MAX_OPEN) throw new ReportError(503, "full");
      const id = await store.insert({
        message: text,
        email: contact,
        page: clean(page, 300) || null,
        lang: clean(lang, 20) || null,
        browser: clean(browser, 300) || null,
        screen: clean(screen, 20) || null,
      });
      return { ok: true, id };
    },

    // ── Site owner, /admin ─────────────────────────────────────────────────
    async review(status = "open") {
      if (!["open", "resolved"].includes(status)) throw new ReportError(400, "bad_status");
      return store.list(status);
    },

    async decide(id, action) {
      const ok =
        action === "delete"
          ? await store.remove(id)
          : await store.setStatus(id, action === "resolve" ? "resolved" : "open");
      if (!ok) throw new ReportError(404, "not_found");
      return { ok: true };
    },
  };
}

function memoryStore() {
  const rows = [];
  let next = 1;
  return {
    async list(status) {
      return rows.filter((r) => r.status === status).map((r) => ({ ...r })).reverse();
    },
    async countOpen() {
      return rows.filter((r) => r.status === "open").length;
    },
    async insert(row) {
      const id = next++;
      rows.push({ ...row, id, status: "open", createdAt: new Date(), resolvedAt: null });
      return id;
    },
    async setStatus(id, status) {
      const row = rows.find((r) => r.id === Number(id));
      if (!row) return false;
      Object.assign(row, { status, resolvedAt: status === "resolved" ? new Date() : null });
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
    message: r.message,
    email: r.email,
    page: r.page,
    lang: r.lang,
    browser: r.browser,
    screen: r.screen,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  });
  return {
    async list(status) {
      const { rows } = await pool.query("SELECT * FROM bug_reports WHERE status = $1 ORDER BY created_at DESC", [status]);
      return rows.map(toRow);
    },
    async countOpen() {
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM bug_reports WHERE status = 'open'");
      return rows[0].n;
    },
    async insert(row) {
      const { rows } = await pool.query(
        `INSERT INTO bug_reports (message, email, page, lang, browser, screen)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [row.message, row.email, row.page, row.lang, row.browser, row.screen],
      );
      return rows[0].id;
    },
    async setStatus(id, status) {
      const { rowCount } = await pool.query(
        `UPDATE bug_reports SET status = $2,
           resolved_at = CASE WHEN $2 = 'resolved' THEN now() END
         WHERE id = $1`,
        [Number(id), status],
      );
      return rowCount > 0;
    },
    async remove(id) {
      const { rowCount } = await pool.query("DELETE FROM bug_reports WHERE id = $1", [Number(id)]);
      return rowCount > 0;
    },
  };
}

module.exports = { MAX_MESSAGE, MIN_MESSAGE, ReportError, createReports, memoryStore, postgresStore };
