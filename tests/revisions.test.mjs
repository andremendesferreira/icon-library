// Iconlibrary: o autor edita os próprios ícones (mesmo código de apoiador).
// Pendente ou recusado muda no lugar; aprovado continua no ar até a revisão
// ser aprovada.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import biblioteca from "../scripts/iconlibrary.js";
import servidor from "../scripts/server.js";

const { createIconlibrary, memoryStore, MAX_PENDING } = biblioteca;

const ANA = { code: "CAFE-AAAA-AAAA", expiresAt: new Date(Date.now() + 86400000) };
const BETO = { code: "CAFE-BBBB-BBBB", expiresAt: new Date(Date.now() + 86400000) };
const svg = (r) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="${r}"/></svg>`;
const envio = (dono, name, extra = {}) => ({ code: dono.code, name, categories: ["shapes"], author: "Ana", svg: svg(8), license: "MIT", ...extra });

function servico() {
  return createIconlibrary({
    store: memoryStore(),
    supporter: async (code) => [ANA, BETO].find((s) => s.code === code) ?? null,
  });
}

const erroDe = async (promessa) => {
  try {
    await promessa;
  } catch (erro) {
    return erro.code;
  }
  return null;
};

test("meus ícones: só os do próprio código, com a situação de cada um", async () => {
  const lib = servico();
  await lib.submit(envio(ANA, "Ring Ana"));
  await lib.submit(envio(BETO, "Ring Beto"));
  const meus = await lib.mine(ANA.code);
  assert.deepEqual(meus.map((i) => [i.name, i.status, i.revision]), [["Ring Ana", "pending", null]]);
  assert.equal(await erroDe(lib.mine("CAFE-ZZZZ-ZZZZ")), "not_supporter");
});

test("editar pendente: muda no lugar e continua na fila; recusado volta para a fila", async () => {
  const lib = servico();
  const { id } = await lib.submit(envio(ANA, "Ring One"));
  const antes = (await lib.get(id)).submittedAt;
  await new Promise((r) => setTimeout(r, 5));
  const r = await lib.edit(id, envio(ANA, "Ring Uno", { svg: svg(6) }));
  assert.deepEqual(r, { id, status: "pending", revision: null });
  const agora = await lib.get(id);
  assert.equal(agora.name, "Ring Uno");
  assert.match(agora.svg, /r="6"/);
  assert.ok(agora.submittedAt > antes, "data do envio atualizada (a moderação automática revê)");

  await lib.decide(id, "reject", "não gostei");
  await lib.edit(id, envio(ANA, "Ring Uno", { svg: svg(5) }));
  const devolta = await lib.get(id);
  assert.equal(devolta.status, "pending");
  assert.equal(devolta.reviewNote, null);
});

test("editar aprovado: o ícone no ar não muda até a revisão ser aprovada", async () => {
  const lib = servico();
  const { id } = await lib.submit(envio(ANA, "Ring Live"));
  await lib.decide(id, "approve");
  const r = await lib.edit(id, envio(ANA, "Ring Live", { svg: svg(4), author: "Ana B." }));
  assert.deepEqual(r, { id, status: "approved", revision: "pending" });
  // No site, ainda a versão aprovada
  const noAr = (await lib.list()).find((i) => i.slug === "ring-live");
  assert.match(noAr.svg, /r="8"/);
  assert.equal(noAr.author, "Ana");
  // Na fila: aparece com a revisão
  const [pendente] = await lib.review("pending");
  assert.equal(pendente.id, id);
  assert.match(pendente.revision.svg, /r="4"/);
  // Aprovar a revisão troca a versão no ar
  await lib.decideRevision(id, "approve");
  const trocado = (await lib.list()).find((i) => i.slug === "ring-live");
  assert.match(trocado.svg, /r="4"/);
  assert.equal(trocado.author, "Ana B.");
  assert.equal((await lib.get(id)).revision, null);
  assert.deepEqual(await lib.review("pending"), []);
});

test("revisão recusada: descartada, a versão no ar continua", async () => {
  const lib = servico();
  const { id } = await lib.submit(envio(ANA, "Ring Keep"));
  await lib.decide(id, "approve");
  await lib.edit(id, envio(ANA, "Ring Changed", { svg: svg(3) }));
  await lib.decideRevision(id, "reject");
  const icone = await lib.get(id);
  assert.equal(icone.status, "approved");
  assert.equal(icone.name, "Ring Keep");
  assert.equal(icone.revision, null);
  assert.equal(await erroDe(lib.decideRevision(id, "approve")), "no_revision");
});

test("editar: só o dono, nomes reservados e voltar ao igual descarta a revisão", async () => {
  const lib = servico();
  const { id } = await lib.submit(envio(ANA, "Ring Mine"));
  await lib.submit(envio(BETO, "Ring Other"));
  assert.equal(await erroDe(lib.edit(id, envio(BETO, "Ring Mine"))), "not_owner");
  assert.equal(await erroDe(lib.edit(999, envio(ANA, "Ring Mine"))), "not_found");
  // Nome de outro ícone: recusado; o próprio nome: tudo bem
  assert.equal(await erroDe(lib.edit(id, envio(ANA, "Ring Other"))), "name_taken");
  await lib.edit(id, envio(ANA, "Ring Mine", { svg: svg(7) }));
  // Nome proposto numa revisão fica reservado
  await lib.decide(id, "approve");
  await lib.edit(id, envio(ANA, "Ring Renamed"));
  assert.equal(await erroDe(lib.submit(envio(BETO, "Ring Renamed"))), "name_taken");
  // Editar de volta para o que está no ar descarta a revisão
  const igual = await lib.edit(id, envio(ANA, "Ring Mine", { svg: svg(7) }));
  assert.equal(igual.revision, null);
  assert.equal((await lib.get(id)).revision, null);
});

test("editar: revisões contam no limite de pendentes do apoiador", async () => {
  const lib = servico();
  const ids = [];
  for (let k = 0; k < MAX_PENDING; k++) ids.push((await lib.submit(envio(ANA, `Shape ${k}`))).id);
  for (const id of ids) await lib.decide(id, "approve");
  for (const id of ids) await lib.edit(id, envio(ANA, `Shape ${ids.indexOf(id)}`, { svg: svg(5) }));
  assert.equal(await erroDe(lib.submit(envio(ANA, "One More"))), "too_many_pending");
  // Trocar uma revisão que já existe não conta de novo
  assert.equal((await lib.edit(ids[0], envio(ANA, "Shape 0", { svg: svg(4) }))).revision, "pending");
});

test("moderação: a fila mistura ícones novos e revisões; decidir age no que está esperando", async () => {
  const lib = servico();
  const novo = (await lib.submit(envio(ANA, "Brand New"))).id;
  const aprovado = (await lib.submit(envio(ANA, "Old Ring"))).id;
  await lib.decide(aprovado, "approve");
  await lib.edit(aprovado, envio(ANA, "Old Ring", { svg: svg(2) }));
  const fila = await lib.queue();
  assert.deepEqual(fila.map((i) => [i.id, i.kind]), [[novo, "icon"], [aprovado, "revision"]]);
  const revisao = fila.find((i) => i.kind === "revision");
  assert.match(revisao.svg, /r="2"/);
  assert.match(revisao.current.svg, /r="8"/);
  assert.match(lib.pendingSvg(await lib.get(aprovado)), /r="2"/);
  // Recusar pela moderação descarta a revisão, sem tirar o ícone do ar
  await lib.decidePending(aprovado, "reject", "IA");
  assert.equal((await lib.get(aprovado)).status, "approved");
  assert.equal(await erroDe(lib.decidePending(aprovado, "approve")), "not_pending");
});

// ── API ─────────────────────────────────────────────────────────────────────
let base;
let instancia;
let lib;
const TOKEN = "m".repeat(40);
const json = { "Content-Type": "application/json" };
const post = (caminho, corpo, headers = {}) =>
  fetch(`${base}${caminho}`, { method: "POST", headers: { ...json, ...headers }, body: JSON.stringify(corpo) });
const admin = { Authorization: "Basic " + Buffer.from("admin:senha").toString("base64") };
const moderador = { Authorization: `Bearer ${TOKEN}` };

before(async () => {
  lib = servico();
  instancia = servidor.createServer({ iconlibrary: lib, adminPassword: "senha", moderationToken: TOKEN });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("API: meus ícones e editar, com o código no corpo", async () => {
  const { id } = await (await post("/api/iconlibrary/icons", envio(ANA, "Api Ring"))).json();
  const meus = await (await post("/api/iconlibrary/mine", { code: ANA.code })).json();
  assert.equal(meus.icons[0].name, "Api Ring");
  assert.equal((await post("/api/iconlibrary/mine", { code: "CAFE-ZZZZ-ZZZZ" })).status, 403);
  assert.equal((await fetch(`${base}/api/iconlibrary/mine`)).status, 405);
  const editado = await post(`/api/iconlibrary/icons/${id}/edit`, envio(ANA, "Api Ring Two"));
  assert.equal(editado.status, 200);
  assert.equal((await editado.json()).status, "pending");
  const alheio = await post(`/api/iconlibrary/icons/${id}/edit`, envio(BETO, "Api Ring Three"));
  assert.equal(alheio.status, 403);
  assert.deepEqual(await alheio.json(), { error: "not_owner" });
});

test("API: /admin aprova ou recusa a revisão; a moderação vê e decide revisões", async () => {
  const { id } = await (await post("/api/iconlibrary/icons", envio(ANA, "Admin Ring"))).json();
  await post(`/api/admin/icons/${id}/approve`, {}, admin);
  await post(`/api/iconlibrary/icons/${id}/edit`, envio(ANA, "Admin Ring", { svg: svg(3) }));

  // Pendentes do /admin trazem a revisão
  const pendentes = await (await fetch(`${base}/api/admin/icons?status=pending`, { headers: admin })).json();
  assert.match(pendentes.icons.find((i) => i.id === id).revision.svg, /r="3"/);

  // Moderação: tipo "revision", data de envio e prévia do que espera decisão
  const fila = await (await fetch(`${base}/api/moderation/icons`, { headers: moderador })).json();
  const item = fila.icons.find((i) => i.id === id);
  assert.equal(item.kind, "revision");
  assert.ok(item.submittedAt);
  assert.equal(item.preview, `/api/moderation/icons/${id}/preview.png`);
  const png = await fetch(`${base}${item.preview}`, { headers: moderador });
  assert.equal(png.status, 200);

  // /admin aprova a revisão: troca no ar
  assert.equal((await post(`/api/admin/icons/${id}/revision/approve`, {}, admin)).status, 200);
  const publico = await (await fetch(`${base}/api/iconlibrary/icons`)).json();
  assert.match(publico.icons.find((i) => i.slug === "admin-ring").svg, /r="3"/);
  assert.equal((await post(`/api/admin/icons/${id}/revision/approve`, {}, admin)).status, 409);
  assert.equal((await post(`/api/admin/icons/${id}/revision/approve`, {})).status, 401);
});
