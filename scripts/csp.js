"use strict";
/**
 * Content-Security-Policy, in three layers:
 *
 * 1. ENFORCED on every response: rules that no third party relies on, so they
 *    cannot break ads or analytics — no <object>/<embed>, no <base> pointing
 *    elsewhere, forms only to this site, frames of this site only.
 *
 * 2. REPORT-ONLY on the pages: the full allowlist (this site, AdSense,
 *    Microsoft Clarity, unpkg for the icon data). Browsers block nothing but
 *    send what *would* be blocked to /api/csp-report, which logs it once per
 *    kind. After real traffic shows the list is complete, it can be enforced
 *    without silently killing the ads.
 *
 * 3. STRICT and enforced on /admin, the page that shows what visitors send
 *    (comments, names, SVG): only its own inline script and style, by hash.
 *
 * The pages have no inline JavaScript and no on* attributes (only JSON data
 * blocks, which CSP does not run), so script-src needs no 'unsafe-inline'.
 */
const crypto = require("crypto");

const ENFORCED = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const GOOGLE_ADS = [
  "https://pagead2.googlesyndication.com",
  "https://*.googlesyndication.com",
  "https://*.doubleclick.net",
  "https://*.google.com",
  "https://*.gstatic.com",
  "https://*.adtrafficquality.google",
  "https://fundingchoicesmessages.google.com",
];
const CLARITY = ["https://www.clarity.ms", "https://*.clarity.ms"];

const PAGES_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' ${[...GOOGLE_ADS, ...CLARITY].join(" ")}`,
  // AdSense writes inline styles; the pages have a few style attributes too
  "style-src 'self' 'unsafe-inline'",
  // Ads and analytics pixels come from many hosts; images cannot run code
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://unpkg.com ${[...GOOGLE_ADS, ...CLARITY].join(" ")}`,
  `frame-src ${GOOGLE_ADS.join(" ")}`,
  // The shape operations worker (js/workers/); Clarity may use a blob: one
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

const sha256 = (text) => `'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`;

// The inline <script> and <style> of a page → a policy that allows only them
function strictPolicyFor(html) {
  const text = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  const blocks = (tag) =>
    [...text.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => sha256(m[1]));
  return [
    "default-src 'none'",
    `script-src ${blocks("script").join(" ") || "'none'"}`,
    `style-src ${blocks("style").join(" ") || "'none'"}`,
    // Icon previews are data: SVG in <img>; review photos come from the API
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// One violation report (report-uri or Reporting API) → a short, private log
// line: directive, blocked host and the page path. No query string, no full
// URL of the blocked resource, no user agent.
function summarize(report) {
  const r = report?.["csp-report"] ?? report?.body ?? report ?? {};
  const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? r.violatedDirective ?? "?")
    .split(" ")[0]
    .slice(0, 40);
  const blockedRaw = String(r["blocked-uri"] ?? r.blockedURL ?? r.blockedUri ?? "?");
  let blocked;
  try {
    blocked = /^[a-z][\w+.-]*:\/\//i.test(blockedRaw) ? new URL(blockedRaw).host : blockedRaw.slice(0, 20);
  } catch {
    blocked = "?";
  }
  let page;
  try {
    page = new URL(String(r["document-uri"] ?? r.documentURL ?? r.documentUri ?? "")).pathname;
  } catch {
    page = "?";
  }
  const clean = (v) => String(v).replace(/[^\w.:/*@-]/g, "").slice(0, 80);
  return `${clean(directive)} ${clean(blocked)} on ${clean(page)}`;
}

// Logs each kind of violation once per process (and at most `max` kinds)
function createCspReports({ log = (line) => console.log(line), max = 300 } = {}) {
  const seen = new Set();
  return {
    record(body) {
      const reports = Array.isArray(body) ? body : [body];
      let logged = 0;
      for (const report of reports.slice(0, 20)) {
        const line = summarize(report);
        if (seen.has(line) || seen.size >= max) continue;
        seen.add(line);
        log(`[csp] would block: ${line}`);
        logged++;
      }
      return logged;
    },
  };
}

module.exports = { ENFORCED, PAGES_REPORT_ONLY, createCspReports, strictPolicyFor, summarize };
