"use strict";
/**
 * Server for the site: static files, a few generated routes and the small
 * "buy me a coffee" API (scripts/coffee.js).
 *
 *   npm start                 → http://localhost:8080
 *   PORT=3000 npm start       → another port
 *
 * Why a server at all: opened straight from disk (file://), the browser blocks
 * the fetch of json/icons-categories.json, and the Clipboard API only works in a
 * secure context (https:// or localhost).
 *
 * Optional environment variables:
 *   SITE_URL               public address (https://example.com), used in
 *                          sitemap.xml and robots.txt; without it, the
 *                          address of the request is used
 *   ADSENSE_PUBLISHER_ID   pub-… ID; enables /ads.txt for Google AdSense
 *   STRIPE_SECRET_KEY, STRIPE_PAYMENT_LINK, PG_HOST…  enable "buy me a coffee"
 *                          (see scripts/coffee.js and .env.example)
 *   COFFEE_PRICE           price shown on the button (default "US$ 3"; the
 *                          real price is the one set in the Stripe Payment Link)
 *   TRUST_PROXY            "true" behind a reverse proxy: the client IP for
 *                          rate limiting comes from X-Forwarded-For
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { CoffeeError, coffeeFromEnv } = require("./coffee");

const ROOT = path.resolve(__dirname, "..", "public");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};
// Worth compressing: text formats above ~1 KB
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".svg", ".txt", ".xml"]);
const MIN_GZIP = 1024;

// Pages listed in the sitemap: the main page in each language (?lang=) and
// every text page (about.html, about.pt-BR.html…), read from public/
function sitemapPages() {
  const files = fs.readdirSync(ROOT).filter((f) => /^(guide|about|privacy)(\.[\w-]+)?\.html$/.test(f)).sort();
  const langs = files.map((f) => f.match(/^about\.([\w-]+)\.html$/)?.[1]).filter(Boolean);
  return ["/", ...langs.map((l) => `/?lang=${l}`), ...files.map((f) => `/${f}`)];
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return `${proto}://${req.headers.host || "localhost"}`;
}

// Generated on the fly: they depend on the public address / the AdSense ID
const DYNAMIC = {
  "/robots.txt": (req) => [
    "text/plain; charset=utf-8",
    `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`,
  ],
  "/sitemap.xml": (req) => [
    "application/xml; charset=utf-8",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPages().map(
      (page) => `  <url><loc>${siteUrl(req)}${page}</loc></url>`,
    ).join("\n")}\n</urlset>\n`,
  ],
  "/ads.txt": () => {
    const id = (process.env.ADSENSE_PUBLISHER_ID || "").replace(/^ca-/, "");
    if (!/^pub-\d+$/.test(id)) return null;
    return [
      "text/plain; charset=utf-8",
      `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`,
    ];
  },
};

// Compressed copies, kept while the file does not change
const gzipCache = new Map();

function send(req, res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(req.method === "HEAD" ? undefined : body);
}

function sendText(req, res, status, text) {
  send(req, res, status, { "Content-Type": "text/plain; charset=utf-8" }, text);
}

// ── API ───────────────────────────────────────────────────────────────────
const MAX_BODY = 4096;
// Per IP, in a 15-minute window: guessing supporter codes stays impractical
const LIMITS = { "/api/coffee/claim": 10, "/api/coffee/redeem": 30 };
const WINDOW = 15 * 60 * 1000;

function sendJson(req, res, status, body) {
  send(req, res, status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify(body));
}

function clientIp(req) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || "?";
}

function createLimiter() {
  const hits = new Map();
  return (key, max) => {
    const now = Date.now();
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + WINDOW });
      return true;
    }
    entry.count++;
    return entry.count <= max;
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    // Past the limit the rest is read and dropped, so the client still gets
    // a 413 answer instead of a broken connection
    req.on("data", (part) => {
      size += part.length;
      if (size <= MAX_BODY) parts.push(part);
    });
    req.on("end", () => {
      if (size > MAX_BODY) return reject(new CoffeeError(413, "too_large"));
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString("utf8") || "{}"));
      } catch {
        reject(new CoffeeError(400, "bad_json"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url, ctx) {
  const { coffee } = ctx;
  if (url === "/api/coffee/config") {
    if (req.method !== "GET" && req.method !== "HEAD") return sendJson(req, res, 405, { error: "method" });
    return sendJson(req, res, 200, coffee
      ? { ...coffee.config(), price: process.env.COFFEE_PRICE || "US$ 3" }
      : { enabled: false });
  }
  const actions = { "/api/coffee/redeem": "redeem", "/api/coffee/claim": "claim" };
  if (!actions[url]) return sendJson(req, res, 404, { error: "not_found" });
  if (req.method !== "POST") return sendJson(req, res, 405, { error: "method" });
  if (!coffee) return sendJson(req, res, 503, { error: "disabled" });
  if (!ctx.limit(`${url} ${clientIp(req)}`, LIMITS[url])) return sendJson(req, res, 429, { error: "too_many" });
  try {
    const body = await readJson(req);
    const result = url.endsWith("redeem") ? await coffee.redeem(body.session) : await coffee.claim(body.code);
    sendJson(req, res, 200, result);
  } catch (err) {
    if (err instanceof CoffeeError) return sendJson(req, res, err.status, { error: err.code });
    console.error("[coffee]", err);
    sendJson(req, res, 500, { error: "server" });
  }
}

function handle(req, res, ctx) {
  // The API takes POST; everything else only GET/HEAD
  let caminho = "";
  try {
    caminho = new URL(req.url, "http://localhost").pathname;
  } catch {}
  if (caminho.startsWith("/api/")) {
    handleApi(req, res, caminho, ctx);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(req, res, 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed");
    return;
  }

  // A malformed address (e.g. "/%E0%A4%A") makes decodeURIComponent throw
  let url;
  try {
    url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    sendText(req, res, 400, "Bad request");
    return;
  }

  const dynamic = DYNAMIC[url]?.(req);
  if (dynamic) {
    const [type, body] = dynamic;
    send(req, res, 200, { "Content-Type": type, "Cache-Control": "public, max-age=3600" }, body);
    return;
  }

  const file = path.join(ROOT, url.endsWith("/") ? url + "index.html" : url);
  // Never serve anything outside the public folder
  if (!file.startsWith(ROOT + path.sep) || url.includes("\0")) {
    sendText(req, res, 403, "Forbidden");
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      sendText(req, res, 404, "Not found");
      return;
    }
    const ext = path.extname(file);
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      ETag: etag,
      // Pages are revalidated on every visit (new versions show up at once);
      // the rest may be reused for a day, revalidated by the ETag afterwards
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    };

    if (req.headers["if-none-match"] === etag) {
      send(req, res, 304, headers);
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        sendText(req, res, 404, "Not found");
        return;
      }
      const gzip =
        COMPRESSIBLE.has(ext) &&
        data.length >= MIN_GZIP &&
        /\bgzip\b/.test(req.headers["accept-encoding"] || "");
      if (COMPRESSIBLE.has(ext)) headers.Vary = "Accept-Encoding";
      if (gzip) {
        let cached = gzipCache.get(file);
        if (!cached || cached.etag !== etag) {
          cached = { etag, body: zlib.gzipSync(data) };
          gzipCache.set(file, cached);
        }
        headers["Content-Encoding"] = "gzip";
        data = cached.body;
      }
      headers["Content-Length"] = data.length;
      send(req, res, 200, headers, data);
    });
  });
}

// coffee: the service from scripts/coffee.js, or null (feature off)
function createServer({ coffee = null } = {}) {
  const ctx = { coffee, limit: createLimiter() };
  return http.createServer((req, res) => {
    try {
      handle(req, res, ctx);
    } catch (err) {
      // Last line of defense: one bad request must not take the site down
      console.error(err);
      if (!res.headersSent) sendText(req, res, 500, "Internal server error");
      else res.destroy();
    }
  });
}

module.exports = { createServer };

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 8080;
  // Inside a container the server must listen on all interfaces (HOST=0.0.0.0)
  const HOST = process.env.HOST || "localhost";
  const coffee = coffeeFromEnv();
  createServer({ coffee }).listen(PORT, HOST, () => {
    console.log(`Icon Library running at http://localhost:${PORT}`);
    console.log(`Buy me a coffee: ${coffee ? "on" : "off (Stripe or database not configured)"}`);
  });
}
