"use strict";
/**
 * "Buy me a coffee": whoever pays a coffee through Stripe gets the site
 * without ads for 30 days.
 *
 * 1. The page links to a Stripe Payment Link whose "after payment" redirect
 *    is  https://iconlibrary.io/?coffee={CHECKOUT_SESSION_ID}
 * 2. Back on the site, the page sends that session id here (redeem). We ask
 *    Stripe whether it was paid and, if so, store a supporter row and return
 *    a supporter code valid until 30 days after the payment.
 * 3. The code can be entered on other devices (claim), up to MAX_DEVICES.
 *
 * Nothing about the person is stored: only the Stripe session id, the code,
 * the amount, the dates and a device counter.
 */
const crypto = require("crypto");

const DAYS = 30;
const MAX_DEVICES = 3;
// No 0/O, 1/I/L: easy to read and type
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const CODE = /^CAFE-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

class CoffeeError extends Error {
  // status: HTTP status for the API; code: machine-readable reason
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function newCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `CAFE-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function normalizeCode(text) {
  const clean = String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith("CAFE") ? clean.slice(4) : clean;
  return body.length === 8 ? `CAFE-${body.slice(0, 4)}-${body.slice(4)}` : null;
}

/**
 * @param {object} opts
 * @param {string} opts.stripeKey        Stripe secret key (sk_live_… / sk_test_… or a restricted key with Checkout Sessions read)
 * @param {string} opts.paymentLink      public URL of the Stripe Payment Link
 * @param {string} [opts.paymentLinkId]  plink_… — if set, only sessions from this link count
 * @param {object} opts.store            see memoryStore / postgresStore
 * @param {Function} [opts.fetch]        injectable for tests
 * @param {Function} [opts.now]          injectable for tests (ms)
 */
function createCoffee({ stripeKey, paymentLink, paymentLinkId, store, fetch = globalThis.fetch, now = Date.now }) {
  async function stripeSession(id) {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (res.status === 404) throw new CoffeeError(404, "unknown_session");
    if (!res.ok) throw new CoffeeError(502, "stripe_unavailable");
    return res.json();
  }

  return {
    config() {
      return { enabled: true, link: paymentLink, days: DAYS, devices: MAX_DEVICES };
    },

    // Session id from Stripe's redirect → supporter code
    async redeem(sessionId) {
      if (!SESSION_ID.test(String(sessionId || ""))) throw new CoffeeError(400, "bad_session");
      // Reloading the thank-you page must not use up devices
      const known = await store.bySession(sessionId);
      if (known) return reply(known);

      const session = await stripeSession(sessionId);
      if (session.status !== "complete" || session.payment_status !== "paid")
        throw new CoffeeError(402, "not_paid");
      if (paymentLinkId && session.payment_link !== paymentLinkId)
        throw new CoffeeError(403, "other_payment");

      const paidAt = new Date((session.created || Math.floor(now() / 1000)) * 1000);
      const row = {
        session: sessionId,
        code: newCode(),
        amount: session.amount_total ?? null,
        currency: session.currency ?? null,
        paidAt,
        expiresAt: new Date(paidAt.getTime() + DAYS * 86400000),
        devices: 1,
      };
      if (row.expiresAt.getTime() <= now()) throw new CoffeeError(410, "expired");
      return reply(await store.insert(row));
    },

    // Supporter code typed on another device
    async claim(text) {
      const code = normalizeCode(text);
      if (!code || !CODE.test(code)) throw new CoffeeError(404, "invalid_code");
      const row = await store.byCode(code);
      if (!row || row.expiresAt.getTime() <= now()) throw new CoffeeError(404, "invalid_code");
      if (!(await store.addDevice(code, MAX_DEVICES))) throw new CoffeeError(409, "too_many_devices");
      return reply(row);
    },
  };
}

function reply(row) {
  return { code: row.code, expires: row.expiresAt.toISOString() };
}

// In memory — for tests and local development without a database
function memoryStore() {
  const rows = new Map();
  return {
    async bySession(session) {
      return [...rows.values()].find((r) => r.session === session) || null;
    },
    async byCode(code) {
      return rows.get(code) || null;
    },
    async insert(row) {
      const existing = await this.bySession(row.session);
      if (existing) return existing;
      rows.set(row.code, { ...row });
      return rows.get(row.code);
    },
    async addDevice(code, max) {
      const row = rows.get(code);
      if (!row || row.devices >= max) return false;
      row.devices++;
      return true;
    },
  };
}

// PostgreSQL — the table is created on first use
function postgresStore(pool) {
  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS coffee_supporters (
      session_id  text PRIMARY KEY,
      code        text UNIQUE NOT NULL,
      amount      integer,
      currency    text,
      paid_at     timestamptz NOT NULL,
      expires_at  timestamptz NOT NULL,
      devices     integer NOT NULL DEFAULT 1,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
  const toRow = (r) =>
    r && {
      session: r.session_id,
      code: r.code,
      amount: r.amount,
      currency: r.currency,
      paidAt: new Date(r.paid_at),
      expiresAt: new Date(r.expires_at),
      devices: r.devices,
    };
  const one = async (sql, params) => {
    await ready;
    const { rows } = await pool.query(sql, params);
    return toRow(rows[0]) || null;
  };
  return {
    bySession: (session) => one("SELECT * FROM coffee_supporters WHERE session_id = $1", [session]),
    byCode: (code) => one("SELECT * FROM coffee_supporters WHERE code = $1", [code]),
    // Two tabs redeeming the same session at once: the second gets the first's row
    insert: async (row) =>
      (await one(
        `INSERT INTO coffee_supporters (session_id, code, amount, currency, paid_at, expires_at, devices)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (session_id) DO NOTHING RETURNING *`,
        [row.session, row.code, row.amount, row.currency, row.paidAt, row.expiresAt, row.devices],
      )) || one("SELECT * FROM coffee_supporters WHERE session_id = $1", [row.session]),
    addDevice: async (code, max) =>
      Boolean(
        await one(
          "UPDATE coffee_supporters SET devices = devices + 1 WHERE code = $1 AND devices < $2 RETURNING *",
          [code, max],
        ),
      ),
  };
}

// Built from the environment; null (feature off) when not configured
function coffeeFromEnv(env = process.env) {
  const { STRIPE_SECRET_KEY, STRIPE_PAYMENT_LINK } = env;
  if (!STRIPE_SECRET_KEY || !STRIPE_PAYMENT_LINK) return null;
  if (!env.PG_HOST) {
    console.warn("[coffee] Stripe is set but PG_HOST is not: coffee is off");
    return null;
  }
  // Loaded only when used: the rest of the site has no dependencies
  const { Pool } = require("pg");
  const pool = new Pool({
    host: env.PG_HOST,
    port: Number(env.PG_PORT) || 5432,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    ssl: env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  pool.on("error", (err) => console.error("[coffee] database:", err.message));
  return createCoffee({
    stripeKey: STRIPE_SECRET_KEY,
    paymentLink: STRIPE_PAYMENT_LINK,
    paymentLinkId: env.STRIPE_PAYMENT_LINK_ID || undefined,
    store: postgresStore(pool),
  });
}

module.exports = {
  CoffeeError,
  DAYS,
  MAX_DEVICES,
  createCoffee,
  memoryStore,
  postgresStore,
  coffeeFromEnv,
  normalizeCode,
};
