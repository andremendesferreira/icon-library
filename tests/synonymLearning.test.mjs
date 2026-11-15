// Busca que aprende: o agente diário manda candidatos em inglês para uma busca
// sem resultado; o servidor testa nos ícones e só guarda os que acham algo.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import aprender from "../scripts/synonymLearning.js";
import indice from "../scripts/iconIndex.js";
import servidor from "../scripts/server.js";

const ICONES = [
  { name: "trash", tags: ["delete", "garbage"] },
  { name: "trash-2", tags: [] },
  { name: "shopping-cart", tags: ["buy"] },
  { name: "arrow-right", tags: [] },
];
const DIA = 24 * 60 * 60 * 1000;
const falta = (term, count, langs, extra = {}) => ({ term, set: "all", count, langs, ...extra });

function criar(misses, agora = () => Date.now()) {
  const store = aprender.memoryStore({ misses });
  return { store, s: aprender.createSynonymLearning({ store, index: async () => ICONES, now: agora }) };
}

test("índice: mesma regra da página (palavra inteira do nome ou palavra-chave exata)", () => {
  assert.equal(indice.countMatches(ICONES, "trash"), 2);
  assert.equal(indice.countMatches(ICONES, "cart"), 1, "palavra inteira de shopping-cart");
  assert.equal(indice.countMatches(ICONES, "car"), 0, "pedaço de palavra não vale");
  assert.equal(indice.countMatches(ICONES, "garbage"), 1, "palavra-chave exata");
  assert.equal(indice.countMatches(ICONES, "arrow right"), 1);
});

test("candidato: inglês em minúsculas, até 4 palavras; o resto é descartado", () => {
  const n = aprender.normalizeCandidate;
  assert.equal(n("  Trash Can "), "trash can");
  assert.equal(n("arrow-right"), "arrow-right");
  for (const ruim of ["lixeira é", "<svg>", "", "a b c d e", "x".repeat(31), "drop table;"]) assert.equal(n(ruim), null, ruim);
});

test("pendentes: buscados 3 vezes ou mais (somando os conjuntos), com o idioma mais comum", async () => {
  const { s } = criar([
    falta("lixeira", 2, { "pt-BR": 2 }),
    { ...falta("lixeira", 1, { "pt-BR": 1 }), set: "lucide" },
    falta("poubelle", 5, { fr: 4, en: 1 }),
    falta("raro", 2, { "pt-BR": 2 }),
    falta("tentado", 9, { "pt-BR": 9 }, { triedAt: new Date(Date.now() - 2 * DIA) }),
    falta("antigo", 4, { es: 4 }, { triedAt: new Date(Date.now() - 40 * DIA) }),
  ]);
  assert.deepEqual(await s.pending(), [
    { term: "poubelle", count: 5, lang: "fr" },
    { term: "antigo", count: 4, lang: "es" },
    { term: "lixeira", count: 3, lang: "pt-BR" },
  ]);
});

test("aprender: guarda só os candidatos que acham ícones e tira o termo da lista", async () => {
  const { store, s } = criar([falta("lixeira", 3, { "pt-BR": 3 })]);
  const r = await s.learn({ term: "Lixeira", lang: "pt-BR", candidates: ["garbage", "trash", "bin", "lixeira", "<x>"] });
  assert.deepEqual(r.learned, ["trash", "garbage"], "mais ícones primeiro");
  assert.deepEqual(r.tested.map((c) => c.term), ["garbage", "trash", "bin"]);
  assert.equal(store.rows.length, 0, "saiu das buscas sem resultado");
  assert.deepEqual((await s.dictionary("pt-BR")).lixeira.slice(0, 3), ["trash", "delete", "bin"], "o escrito à mão vem primeiro");
  assert.deepEqual(await s.dictionary("ja"), {});
  assert.deepEqual((await s.list()).map((x) => [x.lang, x.term, x.targets]), [["pt-BR", "lixeira", ["trash", "garbage"]]]);
  assert.deepEqual(await s.remove("pt-BR", "lixeira"), { ok: true, removed: true });
});

test("aprender: nada achou → marca como tentado e só volta depois de 30 dias", async () => {
  let agora = Date.now();
  const { store, s } = criar([falta("zzzz", 4, { en: 4 })], () => agora);
  assert.deepEqual((await s.learn({ term: "zzzz", lang: "en", candidates: ["nothing"] })).learned, []);
  assert.ok(store.rows[0].triedAt);
  assert.deepEqual(await s.pending(), []);
  agora += 31 * DIA;
  assert.equal((await s.pending()).length, 1);
});

test("aprender: só termo que está na lista, buscado 3 vezes, no idioma em que foi buscado", async () => {
  const { s } = criar([falta("pouco", 2, { "pt-BR": 2 }), falta("muito", 3, { "pt-BR": 3 })]);
  await assert.rejects(s.learn({ term: "qualquer", lang: "pt-BR", candidates: ["trash"] }), { code: "not_pending" });
  await assert.rejects(s.learn({ term: "pouco", lang: "pt-BR", candidates: ["trash"] }), { code: "not_pending" });
  await assert.rejects(s.learn({ term: "muito", lang: "fr", candidates: ["trash"] }), { code: "not_pending" });
  await assert.rejects(s.learn({ term: "muito", lang: "xx", candidates: ["trash"] }), { code: "invalid" });
});

test("editar: os termos do dono substituem, só os que acham ícones; serve também para ensinar", async () => {
  const { store, s } = criar([falta("lixeira", 3, { "pt-BR": 3 }), falta("carrinho", 1, { "pt-BR": 1 })]);
  await s.learn({ term: "lixeira", lang: "pt-BR", candidates: ["garbage", "trash"] });
  const r = await s.edit({ lang: "pt-BR", term: "lixeira", targets: ["trash-2", "nada aqui", "Trash"] });
  assert.deepEqual(r.saved, ["trash-2", "trash"]);
  assert.deepEqual((await s.list())[0].targets, ["trash-2", "trash"], "substituiu, sem garbage");
  await assert.rejects(s.edit({ lang: "pt-BR", term: "lixeira", targets: "nada, zzz" }), { code: "nothing_found" });
  assert.deepEqual((await s.list())[0].targets, ["trash-2", "trash"], "nada mudou");
  // Uma busca sem resultado com 1 só: o dono ensina na hora e ela sai da lista
  assert.deepEqual((await s.edit({ lang: "pt-BR", term: "carrinho", targets: "cart" })).saved, ["cart"]);
  assert.equal(store.rows.length, 0);
});

test("nova análise: volta primeiro para o agente, com a nota; os termos novos substituem", async () => {
  const { s } = criar([falta("pintinho", 3, { "pt-BR": 3 }), falta("poubelle", 9, { fr: 9 })]);
  await s.learn({ term: "pintinho", lang: "pt-BR", candidates: ["trash", "garbage"] });
  await assert.rejects(s.review({ lang: "pt-BR", term: "outro" }), { code: "not_found" });
  assert.deepEqual(await s.review({ lang: "pt-BR", term: "pintinho", hint: "  filhote\nde galinha: chick " }), { ok: true });
  assert.deepEqual((await s.pending())[0], { term: "pintinho", count: 0, lang: "pt-BR", hint: "filhote de galinha: chick" });
  assert.equal((await s.list())[0].hint, "filhote de galinha: chick");
  // Nada achou: os termos antigos ficam e o pedido sai da fila
  assert.deepEqual((await s.learn({ term: "pintinho", lang: "pt-BR", candidates: ["zzz"] })).learned, []);
  assert.deepEqual((await s.list())[0].targets, ["trash", "garbage"]);
  assert.equal((await s.pending()).some((p) => p.hint !== undefined), false);
  await s.review({ lang: "pt-BR", term: "pintinho", hint: "chick" });
  assert.deepEqual((await s.learn({ term: "pintinho", lang: "pt-BR", candidates: ["shopping-cart"] })).learned, ["shopping-cart"]);
  const [linha] = await s.list();
  assert.deepEqual([linha.targets, linha.reviewRequestedAt], [["shopping-cart"], null], "substituiu e saiu da fila");
});

const TOKEN = "s".repeat(40);
const admin = { Authorization: "Basic " + Buffer.from("admin:senha-admin").toString("base64"), "Content-Type": "application/json" };
const agente = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
let base;
let instancia;
before(async () => {
  const { s } = criar([falta("cesta", 3, { "pt-BR": 3 })]);
  instancia = servidor.createServer({ synonyms: s, searchMisses: {}, adminPassword: "senha-admin", moderationToken: TOKEN });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("servidor: o agente lê e ensina com o token; o dicionário público muda na hora", async () => {
  assert.equal((await fetch(`${base}/api/moderation/synonyms/pending`)).status, 401);
  const { terms } = await (await fetch(`${base}/api/moderation/synonyms/pending`, { headers: agente })).json();
  assert.deepEqual(terms, [{ term: "cesta", count: 3, lang: "pt-BR" }]);
  const antes = await (await fetch(`${base}/api/synonyms/pt-BR`)).json();
  assert.equal(antes.cesta, undefined);
  const r = await fetch(`${base}/api/moderation/synonyms/learn`, { method: "POST", headers: agente, body: JSON.stringify({ term: "cesta", lang: "pt-BR", candidates: ["cart", "basket"] }) });
  assert.deepEqual((await r.json()).learned, ["cart"]);
  const depois = await (await fetch(`${base}/api/synonyms/pt-BR`)).json();
  assert.deepEqual(depois.cesta, ["cart"]);
  assert.ok(depois.lixeira, "o dicionário escrito à mão continua");
  const lista = await (await fetch(`${base}/api/admin/synonyms`, { headers: admin })).json();
  assert.deepEqual(lista.synonyms.map((x) => x.term), ["cesta"]);
  const ed = await fetch(`${base}/api/admin/synonyms/edit`, { method: "POST", headers: admin, body: JSON.stringify({ lang: "pt-BR", term: "cesta", targets: ["zzz"] }) });
  assert.deepEqual([ed.status, (await ed.json()).error], [422, "nothing_found"]);
  const ed2 = await fetch(`${base}/api/admin/synonyms/edit`, { method: "POST", headers: admin, body: JSON.stringify({ lang: "pt-BR", term: "cesta", targets: ["shopping cart"] }) });
  assert.deepEqual((await ed2.json()).saved, ["shopping cart"]);
  assert.deepEqual((await (await fetch(`${base}/api/synonyms/pt-BR`)).json()).cesta, ["shopping cart"], "o dicionário público muda na hora");
  const rev = await fetch(`${base}/api/admin/synonyms/review`, { method: "POST", headers: admin, body: JSON.stringify({ lang: "pt-BR", term: "cesta", hint: "basket" }) });
  assert.deepEqual(await rev.json(), { ok: true });
  assert.equal((await fetch(`${base}/api/admin/synonyms/review`, { method: "POST", body: "{}" })).status, 401);
  const del = await fetch(`${base}/api/admin/synonyms/delete`, { method: "POST", headers: admin, body: JSON.stringify({ lang: "pt-BR", term: "cesta" }) });
  assert.deepEqual(await del.json(), { ok: true, removed: true });
  assert.equal((await (await fetch(`${base}/api/synonyms/pt-BR`)).json()).cesta, undefined);
  assert.equal((await fetch(`${base}/api/synonyms/xx`)).status, 404);
});

test("servidor: sem banco, /api/synonyms serve só o dicionário escrito à mão; o agente não existe", async () => {
  const s = servidor.createServer({ moderationToken: TOKEN });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    const url = `http://127.0.0.1:${s.address().port}`;
    assert.ok((await (await fetch(`${url}/api/synonyms/pt-BR`)).json()).lixeira);
    assert.deepEqual(await (await fetch(`${url}/api/synonyms/en`)).json(), {});
    assert.equal((await fetch(`${url}/api/moderation/synonyms/pending`, { headers: agente })).status, 404);
  } finally {
    s.close();
  }
});
