"use strict";
/**
 * Ready-made JSON responses for the public API lists (Iconlibrary icons,
 * supporter reviews): the body, its ETag and its gzip are built once and kept
 * for a short time, so a busy list is neither queried nor compressed on every
 * visit, and a browser that already has it gets a 304.
 *
 * In memory, per container. Writes that change a list call drop(key), so an
 * approval shows up at once instead of after the TTL.
 */
const crypto = require("crypto");
const zlib = require("zlib");

function createResponseCache({ ttl = 60_000, max = 50, now = Date.now } = {}) {
  const entries = new Map();
  const building = new Map();

  function make(value) {
    const body = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    return {
      body,
      gzip: zlib.gzipSync(body),
      etag: `W/"${crypto.createHash("sha1").update(body).digest("base64url").slice(0, 27)}"`,
      until: now() + ttl,
    };
  }

  return {
    // The entry for key, built with load() when missing or stale. Callers
    // arriving while it is being built share the same promise.
    async get(key, load) {
      const hit = entries.get(key);
      if (hit && hit.until > now()) return hit;
      if (building.has(key)) return building.get(key);
      const promise = (async () => {
        try {
          const entry = make(await load());
          if (entries.size >= max && !entries.has(key)) entries.delete(entries.keys().next().value);
          entries.set(key, entry);
          return entry;
        } finally {
          building.delete(key);
        }
      })();
      building.set(key, promise);
      return promise;
    },
    drop(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

module.exports = { createResponseCache };
