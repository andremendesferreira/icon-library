// Cache das listas da API (scripts/cache.js): ETag e 304, gzip, uma consulta
// só para pedidos simultâneos, e a lista nova logo depois de uma aprovação.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";

import cacheMod from "../scripts/cache.js";
import avaliacoes from "../scripts/reviews.js";
import servidor from "../scripts/server.js";

test("cache: monta uma vez, divide entre pedidos simultâneos e expira", async () => {
  let agora = 0;
  let consultas = 0;
  const c = cacheMod.createResponseCache({ ttl: 1000, now: () => agora });
  const carregar = async () => {
    consultas++;
    await new Promise((r) => setTimeout(r, 10));
    return { n: consultas };
  };
  const [a, b] = await Promise.all([c.get("x", carregar), c.get("x", carregar)]);
  assert.equal(consultas, 1);
  assert.equal(a, b);
  assert.match(a.etag, /^W\/"[\w-]+"$/);
  assert.deepEqual(JSON.parse(gunzipSync(a.gzip)), { n: 1 });
  await c.get("x", carregar);
  assert.equal(consultas, 1, "dentro da validade, não consulta");
  agora = 2000;
  assert.deepEqual(JSON.parse((await c.get("x", carregar)).body), { n: 2 });
  c.drop("x");
  await c.get("x", carregar);
  assert.equal(consultas, 3, "drop força uma consulta nova");
});

test("cache: um erro ao montar não fica guardado", async () => {
  const c = cacheMod.createResponseCache();
  await assert.rejects(c.get("x", async () => { throw new Error("banco fora"); }));
  assert.deepEqual(JSON.parse((await c.get("x", async () => [1])).body), [1]);
});

// ── No servidor ────────────────────────────────────────────────────────────
const APOIADOR = { code: "CAFE-AAAA-BBBB", expiresAt: new Date(Date.now() + 86400000) };
const admin = { Authorization: "Basic " + Buffer.from("admin:senha-admin").toString("base64"), "Content-Type": "application/json" };
let base;
let instancia;
let rev;

before(async () => {
  rev = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: async (c) => (c === APOIADOR.code ? APOIADOR : null) });
  instancia = servidor.createServer({ reviews: rev, adminPassword: "senha-admin" });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("servidor: lista com ETag, 304 e gzip; aprovar mostra a nova na hora", async () => {
  const primeira = await fetch(`${base}/api/reviews`, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(primeira.status, 200);
  assert.equal(primeira.headers.get("content-encoding"), "gzip");
  assert.equal(primeira.headers.get("vary"), "Accept-Encoding");
  const etag = primeira.headers.get("etag");
  assert.ok(etag);
  assert.equal((await primeira.json()).total, 0);

  const igual = await fetch(`${base}/api/reviews`, { headers: { "If-None-Match": etag } });
  assert.equal(igual.status, 304);

  await rev.submit({ code: APOIADOR.code, rating: 5, comment: "Muito bom mesmo, recomendo.", name: "Ana", consent: true });
  const [pendente] = await rev.review("pending");
  const aprovar = await fetch(`${base}/api/admin/reviews/${pendente.id}/approve`, { method: "POST", headers: admin, body: "{}" });
  assert.equal(aprovar.status, 200);

  const depois = await fetch(`${base}/api/reviews`, { headers: { "If-None-Match": etag } });
  assert.equal(depois.status, 200, "a versão mudou: não é mais 304");
  assert.notEqual(depois.headers.get("etag"), etag);
  assert.equal((await depois.json()).total, 1);
});
