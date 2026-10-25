// Relatos de bug: validação, armadilha para robôs, a API (pública e /admin) e
// o link para abrir um issue no GitHub.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import relatos from "../scripts/reports.js";
import servidor from "../scripts/server.js";
import { linkDoGithub, paginaDoRelato } from "../public/js/models/reportLink.js";

const { createReports, memoryStore, MAX_MESSAGE } = relatos;

const RELATO = {
  message: "O botão de copiar não faz nada no Firefox.",
  email: "ana@example.com",
  page: "https://iconlibrary.io/?lang=pt-BR",
  lang: "pt-BR",
  browser: "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0",
  screen: "1280×900",
};

const erroDe = async (promessa) => {
  try {
    await promessa;
  } catch (erro) {
    return erro.code;
  }
  return null;
};

test("relato: guarda o texto e o contexto, aberto", async () => {
  const servico = createReports({ store: memoryStore() });
  const { id } = await servico.submit({ ...RELATO, message: "  linha 1\r\nlinha 2\u0007  " });
  const [r] = await servico.review("open");
  assert.equal(r.id, id);
  assert.equal(r.message, "linha 1\nlinha 2");
  assert.equal(r.email, "ana@example.com");
  assert.equal(r.screen, "1280×900");
  assert.deepEqual(await servico.review("resolved"), []);
});

test("relato: curto, longo ou com e-mail errado é recusado", async () => {
  const servico = createReports({ store: memoryStore() });
  assert.equal(await erroDe(servico.submit({ message: "não vai" })), "too_short");
  assert.equal(await erroDe(servico.submit({ message: "x".repeat(MAX_MESSAGE + 1) })), "too_long");
  assert.equal(await erroDe(servico.submit({ ...RELATO, email: "ana@" })), "bad_email");
  // Sem e-mail tudo bem: é opcional
  assert.ok((await servico.submit({ ...RELATO, email: "" })).id);
});

test("relato: robô que preenche o campo escondido não grava nada", async () => {
  const servico = createReports({ store: memoryStore() });
  assert.deepEqual(await servico.submit({ ...RELATO, website: "http://spam.example" }), { ok: true });
  assert.deepEqual(await servico.review("open"), []);
});

test("relato: resolver, reabrir e excluir", async () => {
  const servico = createReports({ store: memoryStore() });
  const { id } = await servico.submit(RELATO);
  await servico.decide(id, "resolve");
  const [resolvido] = await servico.review("resolved");
  assert.ok(resolvido.resolvedAt);
  await servico.decide(id, "reopen");
  assert.equal((await servico.review("open")).length, 1);
  await servico.decide(id, "delete");
  assert.deepEqual(await servico.review("open"), []);
  assert.equal(await erroDe(servico.decide(id, "resolve")), "not_found");
});

test("link do GitHub: título da primeira linha, contexto no corpo, sem o fragmento", () => {
  const contexto = { ...RELATO, page: paginaDoRelato("https://iconlibrary.io/?lang=pt-BR&coffee=cs_1#svg=%3Csvg%3E") };
  assert.equal(contexto.page, "https://iconlibrary.io/?lang=pt-BR");
  const url = new URL(linkDoGithub("Copiar não funciona\nDetalhes aqui", contexto));
  assert.equal(url.origin + url.pathname, "https://github.com/andremendesferreira/icon-library/issues/new");
  assert.equal(url.searchParams.get("title"), "Copiar não funciona");
  assert.equal(url.searchParams.get("labels"), "bug");
  assert.match(url.searchParams.get("body"), /Detalhes aqui[\s\S]*- Browser: Mozilla/);
  // Vazio: título padrão; texto enorme é cortado no link
  assert.equal(new URL(linkDoGithub("", contexto)).searchParams.get("title"), "Bug report");
  assert.ok(linkDoGithub("x".repeat(5000), contexto).length < 3000);
});

// ── API ─────────────────────────────────────────────────────────────────────
let base;
let instancia;
const SENHA = "senha-de-teste";
const auth = (senha) => ({ Authorization: "Basic " + Buffer.from(`admin:${senha}`).toString("base64") });
const json = { "Content-Type": "application/json" };

before(async () => {
  instancia = servidor.createServer({ reports: createReports({ store: memoryStore() }), adminPassword: SENHA });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("API: enviar, ler no /admin e resolver", async () => {
  const config = await (await fetch(`${base}/api/reports/config`)).json();
  assert.equal(config.enabled, true);
  const envio = await fetch(`${base}/api/reports`, { method: "POST", headers: json, body: JSON.stringify(RELATO) });
  assert.equal(envio.status, 201);
  const { id } = await envio.json();

  assert.equal((await fetch(`${base}/api/admin/reports`)).status, 401);
  const abertos = await (await fetch(`${base}/api/admin/reports`, { headers: auth(SENHA) })).json();
  assert.equal(abertos.reports[0].message, RELATO.message);
  const resolve = await fetch(`${base}/api/admin/reports/${id}/resolve`, { method: "POST", headers: { ...auth(SENHA), ...json }, body: "{}" });
  assert.equal(resolve.status, 200);
  const resolvidos = await (await fetch(`${base}/api/admin/reports?status=resolved`, { headers: auth(SENHA) })).json();
  assert.equal(resolvidos.reports[0].id, id);
  // O admin também abre só com relatos (sem Iconlibrary): ícones respondem 404
  assert.equal((await fetch(`${base}/admin`, { headers: auth(SENHA) })).status, 200);
  assert.equal((await fetch(`${base}/api/admin/icons`, { headers: auth(SENHA) })).status, 404);
});

test("API: erro volta com código; limite de envios por IP", async () => {
  const curto = await fetch(`${base}/api/reports`, { method: "POST", headers: json, body: JSON.stringify({ message: "oi" }) });
  assert.equal(curto.status, 400);
  assert.deepEqual(await curto.json(), { error: "too_short" });
  // 5 por janela de 15 minutos; os dois testes acima já gastaram 2
  const status = [];
  for (let i = 0; i < 4; i++)
    status.push((await fetch(`${base}/api/reports`, { method: "POST", headers: json, body: JSON.stringify(RELATO) })).status);
  assert.deepEqual(status, [201, 201, 201, 429]);
});

test("API: sem banco, o formulário fica desligado", async () => {
  const s = servidor.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const raiz = `http://127.0.0.1:${s.address().port}`;
  try {
    assert.deepEqual(await (await fetch(`${raiz}/api/reports/config`)).json(), { enabled: false });
    assert.equal((await fetch(`${raiz}/api/reports`, { method: "POST", headers: json, body: JSON.stringify(RELATO) })).status, 503);
  } finally {
    s.close();
  }
});
