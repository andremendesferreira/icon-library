"use strict";
/**
 * Login with GitHub, Google or Microsoft, only to fill in the name and photo
 * of a supporter review (scripts/reviews.js) and mark it as verified.
 *
 * Authorization code flow with PKCE and a one-time "state". The server reads
 * the profile (id, name, photo) and drops the access token at once: there is
 * no session and no account. The result is a short-lived ticket kept in
 * memory; the page reads name and photo with it and sends it with the review.
 *
 * The browser that starts the login gets a random value in an HttpOnly cookie
 * (scripts/server.js). The callback, the ticket and the review all check it,
 * so a ticket seen by someone else (in a URL, a recording) is useless, and a
 * login started by someone else cannot be planted in this browser.
 *
 * Environment (a provider without both values is simply not offered):
 *   GITHUB_OAUTH_ID, GITHUB_OAUTH_SECRET
 *   GOOGLE_OAUTH_ID, GOOGLE_OAUTH_SECRET
 *   MICROSOFT_OAUTH_ID, MICROSOFT_OAUTH_SECRET
 * Callback address to register with each provider:
 *   <SITE_URL>/api/reviews/auth/<github|google|microsoft>/callback
 */
const crypto = require("crypto");
const { providerHash } = require("./reviews");

const STATE_TTL = 10 * 60 * 1000;
const TICKET_TTL = 30 * 60 * 1000;
const MAX_ENTRIES = 2000;
const MAX_PHOTO = 2 * 1024 * 1024;
const TIMEOUT = 8000;

// Photos are only downloaded from the provider's own image hosts
const PROVIDERS = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "",
    photoHosts: ["avatars.githubusercontent.com"],
    async profile(get, token) {
      const u = await get("https://api.github.com/user", token);
      const photo = u.avatar_url ? `${u.avatar_url}${u.avatar_url.includes("?") ? "&" : "?"}s=192` : null;
      return { id: u.id, name: u.name || u.login, photo };
    },
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid profile",
    photoHosts: [/\.googleusercontent\.com$/],
    async profile(get, token) {
      const u = await get("https://openidconnect.googleapis.com/v1/userinfo", token);
      // "…=s96-c" at the end picks the size
      const photo = u.picture ? u.picture.replace(/=s\d+(-c)?$/, "") + "=s192-c" : null;
      return { id: u.sub, name: u.name, photo };
    },
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid profile User.Read",
    photoHosts: ["graph.microsoft.com"],
    // The photo needs the token too: it is read here, not by URL later
    async profile(get, token, getPhoto) {
      const u = await get("https://graph.microsoft.com/v1.0/me", token);
      const photo =
        (await getPhoto("https://graph.microsoft.com/v1.0/me/photos/120x120/$value", token)) ||
        (await getPhoto("https://graph.microsoft.com/v1.0/me/photo/$value", token));
      return { id: u.id, name: u.displayName, photoData: photo };
    },
  },
};

function configured(env = process.env) {
  const out = {};
  for (const name of Object.keys(PROVIDERS)) {
    const id = env[`${name.toUpperCase()}_OAUTH_ID`];
    const secret = env[`${name.toUpperCase()}_OAUTH_SECRET`];
    if (id && secret) out[name] = { id, secret };
  }
  return out;
}

const base64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function hostAllowed(url, hosts) {
  let host;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    host = u.hostname;
  } catch {
    return false;
  }
  return hosts.some((h) => (h instanceof RegExp ? h.test(host) : h === host));
}

// Map with expiry and a size cap (kept in memory: one container)
function expiringMap(ttl, now) {
  const map = new Map();
  return {
    put(key, value) {
      const t = now();
      if (map.size >= MAX_ENTRIES) for (const [k, v] of map) if (v.expires < t || map.size >= MAX_ENTRIES) map.delete(k);
      map.set(key, { value, expires: t + ttl });
    },
    take(key) {
      const e = map.get(key);
      map.delete(key);
      return e && e.expires >= now() ? e.value : null;
    },
    peek(key) {
      const e = map.get(key);
      return e && e.expires >= now() ? e.value : null;
    },
  };
}

/**
 * @param {object} opts
 * @param {object} opts.credentials  configured(env)
 * @param {Function} opts.render     photo Buffer → PNG Buffer or null (reviews.avatarPng)
 * @param {Function} [opts.fetch]
 */
function createOAuth({ credentials, render, fetch = globalThis.fetch, now = Date.now }) {
  const states = expiringMap(STATE_TTL, now);
  const tickets = expiringMap(TICKET_TTL, now);

  async function fetchJson(url, token, init = {}) {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": "iconlibrary.io", ...(token && { Authorization: `Bearer ${token}` }), ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      // The provider's own error code says what is wrong (AADSTS7000215 is a
      // bad client secret, for example). Error answers carry no token, but
      // only the code and the first line of the description go to the log.
      let detail = "";
      try {
        const body = await res.json();
        const code = typeof body.error === "string" ? body.error : body.error?.code;
        const text = String(body.error_description ?? body.error?.message ?? "").split(/\r?\n/)[0].slice(0, 160);
        detail = [code, text].filter(Boolean).join(": ");
      } catch {}
      throw new Error(`${new URL(url).hostname} answered ${res.status}${detail ? ` (${detail})` : ""}`);
    }
    return res.json();
  }

  async function fetchPhoto(url, token, hosts) {
    if (!url || !hostAllowed(url, hosts)) return null;
    try {
      const res = await fetch(url, {
        headers: { Accept: "image/png,image/jpeg", "User-Agent": "iconlibrary.io", ...(token && { Authorization: `Bearer ${token}` }) },
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok) return null;
      if (Number(res.headers?.get?.("content-length")) > MAX_PHOTO) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length && buf.length <= MAX_PHOTO ? buf : null;
    } catch {
      return null;
    }
  }

  return {
    providers: () => Object.keys(credentials),

    // A new value for the browser's cookie
    newBrowser: () => base64url(crypto.randomBytes(24)),

    // → the provider's address to send the browser to
    start(provider, { redirectUri, lang, browser }) {
      const p = PROVIDERS[provider];
      const cred = credentials[provider];
      if (!p || !cred || !browser) return null;
      const state = base64url(crypto.randomBytes(24));
      const verifier = base64url(crypto.randomBytes(32));
      states.put(state, { provider, verifier, lang, redirectUri, browser });
      const q = new URLSearchParams({
        client_id: cred.id,
        redirect_uri: redirectUri,
        response_type: "code",
        state,
        code_challenge: base64url(crypto.createHash("sha256").update(verifier).digest()),
        code_challenge_method: "S256",
      });
      if (p.scope) q.set("scope", p.scope);
      if (provider === "google") q.set("prompt", "select_account");
      if (provider === "microsoft") q.set("prompt", "select_account");
      if (provider === "github") q.set("allow_signup", "false");
      return `${p.authorize}?${q}`;
    },

    // The provider sent the browser back: code → profile → ticket.
    // Returns { lang, ticket } or { lang, error }.
    async finish(provider, { code, state, error, browser }) {
      const saved = state ? states.take(String(state)) : null;
      if (!saved || saved.provider !== provider || !browser || saved.browser !== browser)
        return { lang: saved?.lang, error: "state" };
      if (error || !code) return { lang: saved.lang, error: "denied" };
      const p = PROVIDERS[provider];
      const cred = credentials[provider];
      try {
        const body = new URLSearchParams({
          client_id: cred.id,
          client_secret: cred.secret,
          code: String(code),
          redirect_uri: saved.redirectUri,
          grant_type: "authorization_code",
          code_verifier: saved.verifier,
        });
        const tok = await fetchJson(p.token, null, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!tok.access_token) throw new Error(`no access token (${tok.error || "?"})`);
        const profile = await p.profile(
          (url, t) => fetchJson(url, t),
          tok.access_token,
          (url, t) => fetchPhoto(url, t, p.photoHosts),
        );
        if (profile.id == null) throw new Error("profile without id");
        const photo = profile.photoData || (await fetchPhoto(profile.photo, null, p.photoHosts));
        const ticket = base64url(crypto.randomBytes(24));
        tickets.put(ticket, {
          browser,
          provider,
          providerHash: providerHash(provider, profile.id),
          name: String(profile.name || "").replace(/\p{Cc}/gu, " ").trim().slice(0, 40),
          // Provider photos are small; 2048 px leaves room for a large one
          avatar: photo ? render(photo, { maxSide: 2048 }) : null,
        });
        return { lang: saved.lang, ticket };
      } catch (err) {
        console.error(`[oauth] ${provider}: ${err.message}`);
        return { lang: saved.lang, error: "failed" };
      }
    },

    // Name and photo for the form (the ticket stays valid for the review);
    // only for the browser that signed in
    identity(ticket, browser) {
      const t = tickets.peek(String(ticket));
      return t && browser && t.browser === browser ? t : null;
    },
    // Used once, by the review
    take(ticket, browser) {
      const t = this.identity(ticket, browser);
      if (t) tickets.take(String(ticket));
      return t;
    },
  };
}

module.exports = { PROVIDERS, configured, createOAuth, hostAllowed };
