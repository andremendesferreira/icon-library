"use strict";
/**
 * IndexNow: tells Bing, Yandex, Naver, Seznam and Yep that the site changed,
 * so they recrawl it within days instead of weeks. Google does not take part.
 *
 * The key is public by design: the search engine checks that the site is
 * yours by fetching https://<site>/<key>.txt, which the server answers with
 * the key itself. Generate one with:
 *   openssl rand -hex 16
 */
const KEY = /^[A-Za-z0-9-]{8,128}$/;
const ENDPOINT = "https://api.indexnow.org/indexnow";

// INDEXNOW_KEY when valid; "" otherwise (feature off)
function indexNowKey(env = process.env) {
  const key = (env.INDEXNOW_KEY || "").trim();
  return KEY.test(key) ? key : "";
}

// One POST with every address. 200 or 202 means accepted; 403, a key the
// search engine could not confirm at keyLocation; 422, an address outside
// the site; 429, too many submissions
async function submitIndexNow({ site, key, urls, fetchImpl = fetch }) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${key}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(15000),
  });
  return res.status;
}

const MEANING = {
  200: "accepted",
  202: "accepted, key still being checked",
  400: "bad request",
  403: "key not confirmed at keyLocation",
  422: "an address is outside the site",
  429: "too many submissions",
};
const describeStatus = (status) => `${status} ${MEANING[status] || "unexpected answer"}`;

module.exports = { ENDPOINT, indexNowKey, submitIndexNow, describeStatus };
