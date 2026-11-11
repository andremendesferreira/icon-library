// Buscas sem resultado: só o termo, o conjunto e o idioma; nada que pareça
// dado pessoal; contagem por termo; lista e exclusão no /admin.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import buscas from "../scripts/searchMisses.js";
import servidor from "../scripts/server.js";

test("termo: normalizado, e o que parece dado pessoal é descartado", () => {
  const n = buscas.normalizeTerm;
  assert.equal(n("  Lixeira   Cheia "), "lixeira cheia");
  assert.equal(n("café"), "café");
  assert.equal(n("火箭"), "火箭");
  assert.equal(n("c++"), "c++");
  for (const ruim of ["a", "ana@exemplo.com", "https://x.com", "www.site.com", "11987654321", "<script>", "x".repeat(41), "teste‮abc".replace("‮", "{}")])
    assert.equal(n(ruim), null, ruim);
});

test("registro: conta por termo e conjunto, com os idiomas; ignora conjunto desconhecido", async () => {
  const b = buscas.createSearchMisses({ store: buscas.memoryStore() });
  await b.record({ term: "Pix", set: "lucide", lang: "pt-BR" });
  await b.record({ term: "pix ", set: "lucide", lang: "pt-BR" });
  await b.record({ term: "pix", set: "lucide", lang: "en" });
  await b.record({ term: "pix", set: "feather", lang: "xx" });
  assert.deepEqual(await b.record({ term: "pix", set: "outro" }), { ok: true, stored: false });
  assert.deepEqual(await b.record({ term: "eu@mail.com", set: "lucide" }), { ok: true, stored: false });
  const [primeiro, segundo] = await b.top();
  assert.deepEqual([primeiro.term, primeiro.set, primeiro.count, primeiro.langs], ["pix", "lucide", 3, { "pt-BR": 2, en: 1 }]);
  assert.deepEqual([segundo.set, segundo.langs], ["feather", { en: 1 }]);
  assert.deepEqual(await b.remove("pix", "lucide"), { ok: true, removed: true });
  assert.equal((await b.top()).length, 1);
});

let base;
let instancia;
let b;
const admin = { Authorization: "Basic " + Buffer.from("admin:senha-admin").toString("base64"), "Content-Type": "application/json" };
before(async () => {
  b = buscas.createSearchMisses({ store: buscas.memoryStore() });
  instancia = servidor.createServer({ searchMisses: b, adminPassword: "senha-admin" });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("servidor: a página manda e recebe 204; o /admin lista e exclui", async () => {
  const enviar = (corpo) => fetch(`${base}/api/search-misses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  assert.equal((await enviar({ term: "foguete espacial", set: "bootstrap", lang: "pt-BR" })).status, 204);
  assert.equal((await enviar({ term: "a@b.co", set: "bootstrap" })).status, 204, "descartado sem erro");
  assert.equal((await fetch(`${base}/api/admin/search-misses`)).status, 401);
  const { misses } = await (await fetch(`${base}/api/admin/search-misses`, { headers: admin })).json();
  assert.deepEqual(misses.map((m) => m.term), ["foguete espacial"]);
  const del = await fetch(`${base}/api/admin/search-misses/delete`, { method: "POST", headers: admin, body: JSON.stringify({ term: "foguete espacial", set: "bootstrap" }) });
  assert.deepEqual(await del.json(), { ok: true, removed: true });
});

test("servidor: sem banco, a página recebe 204 e nada é guardado", async () => {
  const s = servidor.createServer({});
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/search-misses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 204);
  } finally {
    s.close();
  }
});
