// API de moderação (n8n): token próprio, lista de pendentes, prévia em PNG e
// aprovar/recusar — e nada além disso.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import biblioteca from "../scripts/iconlibrary.js";
import servidor from "../scripts/server.js";
import previa from "../scripts/preview.js";

const TOKEN = "t".repeat(40);
const APOIADOR = { code: "CAFE-AAAA-BBBB", expiresAt: new Date(Date.now() + 86400000) };
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>';
const envio = (name) => ({ code: APOIADOR.code, name, categories: ["shapes"], author: "Ana", svg: SVG, license: "MIT" });

const comToken = (token = TOKEN) => ({ Authorization: `Bearer ${token}` });
const json = { "Content-Type": "application/json" };
// Largura e altura gravadas no cabeçalho IHDR do PNG
const tamanhoPng = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

let base;
let instancia;
let lib;

before(async () => {
  lib = biblioteca.createIconlibrary({
    store: biblioteca.memoryStore(),
    supporter: async (code) => (code === APOIADOR.code ? APOIADOR : null),
  });
  instancia = servidor.createServer({ iconlibrary: lib, adminPassword: "senha-admin", moderationToken: TOKEN });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("moderação: sem MODERATION_TOKEN no servidor, a API não existe", async () => {
  const s = servidor.createServer({ iconlibrary: lib });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/moderation/icons`, { headers: comToken() });
    assert.equal(r.status, 404);
  } finally {
    s.close();
  }
});

test("moderação: sem token, ou com o errado, 401", async () => {
  const sem = await fetch(`${base}/api/moderation/icons`);
  assert.equal(sem.status, 401);
  assert.match(sem.headers.get("www-authenticate"), /^Bearer /);
  assert.equal((await fetch(`${base}/api/moderation/icons`, { headers: comToken("x".repeat(40)) })).status, 401);
  // A senha de administrador (Basic) não serve aqui, e o token não abre o /admin
  const basic = { Authorization: "Basic " + Buffer.from("admin:senha-admin").toString("base64") };
  assert.equal((await fetch(`${base}/api/moderation/icons`, { headers: basic })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/icons`, { headers: comToken() })).status, 401);
});

test("moderação: lista os pendentes com o endereço da prévia", async () => {
  const { id } = await lib.submit(envio("Ring One"));
  const { icons } = await (await fetch(`${base}/api/moderation/icons`, { headers: comToken() })).json();
  const icone = icons.find((i) => i.id === id);
  assert.equal(icone.name, "Ring One");
  assert.deepEqual(icone.categories, ["shapes"]);
  assert.equal(icone.preview, `/api/moderation/icons/${id}/preview.png`);
  // O código do apoiador não vai para o moderador automático
  assert.equal(icone.supporterCode, undefined);
});

test("moderação: prévia em PNG, no tamanho pedido e dentro dos limites", async () => {
  const { id } = await lib.submit(envio("Ring Two"));
  const r = await fetch(`${base}/api/moderation/icons/${id}/preview.png`, { headers: comToken() });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  const png = Buffer.from(await r.arrayBuffer());
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.deepEqual(tamanhoPng(png), [256, 256]);
  const pequeno = Buffer.from(await (await fetch(`${base}/api/moderation/icons/${id}/preview.png?size=24`, { headers: comToken() })).arrayBuffer());
  assert.deepEqual(tamanhoPng(pequeno), [24, 24]);
  const enorme = Buffer.from(await (await fetch(`${base}/api/moderation/icons/${id}/preview.png?size=99999`, { headers: comToken() })).arrayBuffer());
  assert.deepEqual(tamanhoPng(enorme), [previa.MAX_SIZE, previa.MAX_SIZE]);
  assert.equal((await fetch(`${base}/api/moderation/icons/999999/preview.png`, { headers: comToken() })).status, 404);
});

test("moderação: aprova e recusa só pendentes; não exclui nada", async () => {
  const aprovar = (await lib.submit(envio("Ring Three"))).id;
  const recusar = (await lib.submit(envio("Ring Four"))).id;
  const post = (id, acao, corpo = {}) =>
    fetch(`${base}/api/moderation/icons/${id}/${acao}`, { method: "POST", headers: { ...comToken(), ...json }, body: JSON.stringify(corpo) });

  assert.equal((await post(aprovar, "approve")).status, 200);
  assert.equal((await post(recusar, "reject", { note: "logo de marca (IA)" })).status, 200);
  const [recusado] = (await lib.review("rejected")).filter((i) => i.id === recusar);
  assert.equal(recusado.reviewNote, "logo de marca (IA)");

  // Decisão já tomada (por uma pessoa ou antes) não é desfeita pelo robô
  const repetido = await post(aprovar, "reject");
  assert.equal(repetido.status, 409);
  assert.deepEqual(await repetido.json(), { error: "not_pending", status: "approved" });
  assert.equal((await post(999999, "approve")).status, 404);
  // Excluir não existe na API de moderação
  assert.equal((await post(aprovar, "delete")).status, 404);
  assert.equal((await fetch(`${base}/api/moderation/icons/${aprovar}/approve`, { headers: comToken() })).status, 405);
});
