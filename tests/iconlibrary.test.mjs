// Iconlibrary: validação do SVG enviado, regras de publicação, moderação e
// a API (pública e /admin).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

import seguro from "../scripts/svgSafe.js";
import biblioteca from "../scripts/iconlibrary.js";
import cafe from "../scripts/coffee.js";
import servidor from "../scripts/server.js";
import banco from "../scripts/db.js";

const { sanitizeSvg } = seguro;
const { createIconlibrary, memoryStore, slugify, MAX_PENDING } = biblioteca;

// Como o editor gera: tag <svg> com o estilo e formas planas
const EDITOR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676Z"/><circle cx="12" cy="12" r="3" fill="#dc2626" stroke="none"/></svg>';

test("SVG do editor passa, normalizado (24×24, só atributos conhecidos)", () => {
  const svg = sanitizeSvg(`  ${EDITOR.replace("<svg ", '<svg class="lucide" ')}  `);
  assert.equal(
    svg,
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676Z"/><circle cx="12" cy="12" r="3" fill="#dc2626" stroke="none"/></svg>',
  );
  // Bootstrap: preenchido, 16×16, fill-rule
  assert.match(
    sanitizeSvg('<svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 1.3C12 -3 23 4.7 8 15"/></svg>'),
    /viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd"/,
  );
});

test("SVG perigoso ou fora do formato é recusado, nunca 'limpo'", () => {
  const casos = {
    svg_shapes: [
      '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>',
      '<svg viewBox="0 0 24 24"><g><path d="M1 1"/></g></svg>',
      '<svg viewBox="0 0 24 24"><text x="1" y="1">oi</text></svg>',
      '<svg viewBox="0 0 24 24"><image href="x.png"/></svg>',
      '<svg viewBox="0 0 24 24"><foreignObject/></svg>',
      '<svg viewBox="0 0 24 24"><!-- c --><path d="M1 1"/></svg>',
      '<svg viewBox="0 0 24 24"><path d="M1 1"></path></svg>',
    ],
    svg_attribute: [
      '<svg viewBox="0 0 24 24"><path d="M1 1" onload="alert(1)"/></svg>',
      '<svg viewBox="0 0 24 24"><path d="M1 1" style="fill:red"/></svg>',
      '<svg viewBox="0 0 24 24"><path d="M1 1" fill="url(#x)"/></svg>',
      '<svg viewBox="0 0 24 24"><circle cx="javascript:1" cy="1" r="1"/></svg>',
      '<svg viewBox="0 0 24 24"><path d="M1 1;alert(1)"/></svg>',
    ],
    svg_invalid: [
      "<div></div>",
      '<svg><path d="M1 1"/></svg>',
      '<svg viewBox="0 0 24 24"><path d=\'M1 1\'/></svg>',
      '<svg viewBox="0 0 24 24"><path d="&lt;x"/></svg>',
      '<svg xmlns="http://evil" viewBox="0 0 24 24"><path d="M1 1"/></svg>',
      '<svg viewBox="0 0 24 24"><path d="M1 1" d="M2 2"/></svg>',
    ],
    svg_empty: ['<svg viewBox="0 0 24 24"></svg>'],
    svg_too_large: [`<svg viewBox="0 0 24 24">${'<path d="M1 1"/>'.repeat(1400)}</svg>`],
  };
  for (const [codigo, entradas] of Object.entries(casos))
    for (const entrada of entradas)
      assert.throws(() => sanitizeSvg(entrada), { code: codigo }, `${codigo}: ${entrada.slice(0, 70)}`);
});

test("slugify: nome legível vira identificador", () => {
  assert.equal(slugify("Rocket Launch"), "rocket-launch");
  assert.equal(slugify("Coração  Partido"), "coracao-partido");
});

const APOIADOR = { code: "CAFE-AAAA-BBBB", expiresAt: new Date(Date.now() + 86400000) };
function servico() {
  return createIconlibrary({
    store: memoryStore(),
    supporter: async (code) => (code === APOIADOR.code ? APOIADOR : null),
  });
}
const ENVIO = { code: APOIADOR.code, name: "Starred Heart", categories: ["shapes", "emoji"], author: "Ana", svg: EDITOR, license: "MIT" };

test("publicar exige apoiador, licença MIT, nome e categorias válidos", async () => {
  const lib = servico();
  await assert.rejects(lib.submit({ ...ENVIO, license: undefined }), { status: 400, code: "license_required" });
  await assert.rejects(lib.submit({ ...ENVIO, code: "CAFE-XXXX-XXXX" }), { status: 403, code: "not_supporter" });
  await assert.rejects(lib.submit({ ...ENVIO, name: "x" }), { code: "bad_name" });
  await assert.rejects(lib.submit({ ...ENVIO, name: "<b>oi</b>" }), { code: "bad_name" });
  await assert.rejects(lib.submit({ ...ENVIO, categories: [] }), { code: "bad_categories" });
  await assert.rejects(lib.submit({ ...ENVIO, categories: ["a", "b", "c", "d"] }), { code: "bad_categories" });
  await assert.rejects(lib.submit({ ...ENVIO, categories: ["inexistente"] }), { code: "bad_categories" });
  await assert.rejects(lib.submit({ ...ENVIO, author: "<script>" }), { code: "bad_author" });
  await assert.rejects(lib.submit({ ...ENVIO, svg: "<svg><text>x</text></svg>" }), { code: "svg_invalid" });
  assert.deepEqual(await lib.submit(ENVIO), { id: 1, slug: "starred-heart", status: "pending" });
});

test("fica pendente até aprovar; nome recusado volta a ficar livre", async () => {
  const lib = servico();
  const { id } = await lib.submit(ENVIO);
  assert.deepEqual(await lib.list(), []);
  await assert.rejects(lib.submit(ENVIO), { status: 409, code: "name_taken" });
  await lib.decide(id, "reject", "parece uma marca");
  const outro = await lib.submit(ENVIO);
  await lib.decide(outro.id, "approve");
  const [icone] = await lib.list();
  assert.deepEqual(Object.keys(icone).sort(), ["author", "categories", "name", "slug", "svg"]);
  assert.equal(icone.name, "Starred Heart");
  assert.equal((await lib.review("rejected"))[0].reviewNote, "parece uma marca");
  await assert.rejects(lib.decide(999, "approve"), { status: 404 });
});

test("limite de envios pendentes por apoiador", async () => {
  const lib = servico();
  for (let i = 0; i < MAX_PENDING; i++) await lib.submit({ ...ENVIO, name: `Icon ${i}` });
  await assert.rejects(lib.submit({ ...ENVIO, name: "Mais um" }), { status: 429, code: "too_many_pending" });
});

test("apoiador: só código válido e não vencido", async () => {
  let agora = Date.now();
  const store = cafe.memoryStore();
  const c = cafe.createCoffee({
    stripeKey: "x",
    paymentLink: "y",
    store,
    now: () => agora,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ status: "complete", payment_status: "paid", created: Math.floor(agora / 1000) }) }),
  });
  const { code } = await c.redeem("cs_test_pago123456");
  assert.equal((await c.supporter(code.toLowerCase())).code, code);
  assert.equal(await c.supporter("CAFE-0000-0000"), null);
  agora += 31 * 86400000;
  assert.equal(await c.supporter(code), null);
});

test("migrations: numeradas, a 001 é a tabela do café", () => {
  const arquivos = banco.migrationFiles();
  assert.deepEqual(arquivos, readdirSync(new URL("../migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort());
  assert.match(arquivos[0], /^001_coffee_supporters\.sql$/);
  assert.match(arquivos[1], /^002_iconlibrary_icons\.sql$/);
});

// ── API ─────────────────────────────────────────────────────────────────────
let base;
let instancia;
const SENHA = "senha-de-teste";
const auth = (senha) => ({ Authorization: "Basic " + Buffer.from(`admin:${senha}`).toString("base64") });
const json = { "Content-Type": "application/json" };

before(async () => {
  instancia = servidor.createServer({ iconlibrary: servico(), adminPassword: SENHA });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("API: enviar, moderar e listar", async () => {
  assert.deepEqual(await (await fetch(`${base}/api/iconlibrary/config`)).json(), { enabled: true, maxCategories: 3, license: "MIT" });
  const envio = await fetch(`${base}/api/iconlibrary/icons`, { method: "POST", headers: json, body: JSON.stringify(ENVIO) });
  assert.equal(envio.status, 201);
  const { id } = await envio.json();

  const vazio = await (await fetch(`${base}/api/iconlibrary/icons`)).json();
  assert.deepEqual(vazio, { enabled: true, icons: [] });

  const pendentes = await (await fetch(`${base}/api/admin/icons`, { headers: auth(SENHA) })).json();
  assert.equal(pendentes.icons[0].supporterCode, APOIADOR.code);
  const aprova = await fetch(`${base}/api/admin/icons/${id}/approve`, { method: "POST", headers: { ...auth(SENHA), ...json }, body: "{}" });
  assert.equal(aprova.status, 200);
  const lista = await (await fetch(`${base}/api/iconlibrary/icons`)).json();
  assert.equal(lista.icons[0].slug, "starred-heart");
});

test("API: erros de envio voltam com código", async () => {
  const r = await fetch(`${base}/api/iconlibrary/icons`, { method: "POST", headers: json, body: JSON.stringify({ ...ENVIO, categories: [] }) });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "bad_categories", max: 3 });
});

test("admin: sem senha certa não entra; página fora de public/", async () => {
  const semSenha = await fetch(`${base}/admin`);
  assert.equal(semSenha.status, 401);
  assert.match(semSenha.headers.get("www-authenticate"), /^Basic /);
  assert.equal((await fetch(`${base}/admin`, { headers: auth("errada") })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/icons`, { headers: auth("errada") })).status, 401);
  const pagina = await fetch(`${base}/admin`, { headers: auth(SENHA) });
  assert.equal(pagina.status, 200);
  assert.match(await pagina.text(), /Iconlibrary — moderação/);
  assert.equal((await fetch(`${base}/admin.html`)).status, 404);
});

test("admin: desligado sem ADMIN_PASSWORD; Iconlibrary desligada sem banco", async () => {
  const s = servidor.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const raiz = `http://127.0.0.1:${s.address().port}`;
  try {
    assert.equal((await fetch(`${raiz}/admin`)).status, 404);
    assert.deepEqual(await (await fetch(`${raiz}/api/iconlibrary/icons`)).json(), { enabled: false, icons: [] });
    assert.equal((await fetch(`${raiz}/api/iconlibrary/icons`, { method: "POST", headers: json, body: "{}" })).status, 503);
  } finally {
    s.close();
  }
});
