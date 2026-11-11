// Avaliações dos apoiadores: só com código válido, uma por código, tudo passa
// pela moderação, a foto é sempre redesenhada no servidor, e o login com
// GitHub/Google/Microsoft só preenche nome e foto.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import avaliacoes from "../scripts/reviews.js";
import oauthMod from "../scripts/oauth.js";
import servidor from "../scripts/server.js";

const APOIADOR = { code: "CAFE-AAAA-BBBB", expiresAt: new Date(Date.now() + 86400000) };
const OUTRO = { code: "CAFE-CCCC-DDDD", expiresAt: new Date(Date.now() + 86400000) };
const apoiador = async (code) => [APOIADOR, OUTRO].find((a) => a.code === code) ?? null;
const PNG = readFileSync(new URL("../public/img/favicon-32.png", import.meta.url));
const dataUrl = (buf, tipo = "png") => `data:image/${tipo};base64,${buf.toString("base64")}`;
const envio = (extra = {}) => ({
  code: APOIADOR.code,
  rating: 5,
  comment: "Ótimo site, uso todo dia no trabalho.",
  name: "Ana",
  consent: true,
  lang: "pt-BR",
  ...extra,
});
const tamanhoPng = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test("avaliação: só apoiador, nota 1–5, comentário e nome válidos, consentimento", async () => {
  const r = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador });
  const erro = async (corpo, codigo) => assert.rejects(r.submit(corpo), (e) => e.code === codigo);
  await erro(envio({ code: "CAFE-XXXX-XXXX" }), "not_supporter");
  await erro(envio({ rating: 0 }), "bad_rating");
  await erro(envio({ rating: 4.5 }), "bad_rating");
  await erro(envio({ comment: "curto" }), "too_short");
  await erro(envio({ comment: "x".repeat(601) }), "too_long");
  await erro(envio({ name: "   " }), "no_name");
  await erro(envio({ name: "n".repeat(41) }), "name_too_long");
  await erro(envio({ consent: false }), "consent");
  assert.deepEqual(await r.submit(envio()), { ok: true, status: "pending" });
  // Pendente não aparece para o público
  assert.equal((await r.list()).total, 0);
});

test("avaliação: robô que preenche o campo escondido não grava nada", async () => {
  const store = avaliacoes.memoryStore();
  const r = avaliacoes.createReviews({ store, supporter: apoiador });
  assert.deepEqual(await r.submit(envio({ website: "http://spam" })), { ok: true, status: "pending" });
  assert.equal(await store.countPending(), 0);
});

test("avaliação: aprovada aparece com média; a edição espera e a aprovada continua no ar", async () => {
  const r = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador });
  await r.submit(envio({ rating: 4 }));
  await r.submit(envio({ code: OUTRO.code, rating: 5, name: "Bia" }));
  const fila = await r.review("pending");
  assert.equal(fila.length, 2);
  for (const a of fila) await r.decide(a.id, "approve");
  let lista = await r.list();
  assert.equal(lista.total, 2);
  assert.equal(lista.average, 4.5);
  // O código do apoiador nunca vai para o público
  assert.ok(!JSON.stringify(lista).includes("CAFE-"));

  assert.deepEqual(await r.submit(envio({ rating: 1, comment: "Mudei de ideia, piorou muito." })), { ok: true, status: "edit_pending" });
  lista = await r.list();
  assert.equal(lista.average, 4.5, "a versão aprovada continua até a decisão");
  const [edicao] = await r.review("pending");
  assert.equal(edicao.edit, true);
  assert.equal(edicao.rating, 1);
  assert.equal(edicao.current.rating, 4);
  // Recusar a edição mantém a aprovada
  await r.decide(edicao.id, "reject", { note: "teste" });
  assert.equal((await r.list()).average, 4.5);
  assert.equal((await r.review("pending")).length, 0);
  // Aprovar a próxima edição troca o texto no ar
  await r.submit(envio({ rating: 3, comment: "Bom, mas poderia ter mais ícones." }));
  await r.decide(edicao.id, "approve");
  assert.equal((await r.list()).average, 4);
});

test("avaliação: o moderador automático só decide o que espera, e vê a versão certa", async () => {
  let agora = Date.parse("2026-11-11T12:00:00Z");
  const r = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador, now: () => agora });
  await r.submit(envio());
  const [a] = await r.queue();
  assert.equal(a.supporterCode, undefined, "a fila do n8n não mostra o código");
  const visto = new Date(a.submittedAt).getTime();
  agora += 5000;
  await r.submit(envio({ comment: "Texto mudado depois que o moderador viu." }));
  await assert.rejects(r.decide(a.id, "approve", { seen: visto, onlyPending: true }), (e) => e.code === "changed");
  const [b] = await r.queue();
  await r.decide(b.id, "approve", { seen: new Date(b.submittedAt).getTime(), onlyPending: true });
  await assert.rejects(r.decide(b.id, "reject", { onlyPending: true }), (e) => e.code === "not_pending");
  await assert.rejects(r.decide(999, "approve"), (e) => e.code === "not_found");
});

test("foto: PNG e JPEG viram PNG 96×96; outra coisa é recusada", async () => {
  const png = avaliacoes.avatarPng(PNG);
  assert.ok(png);
  assert.deepEqual(tamanhoPng(png), [96, 96]);
  assert.equal(avaliacoes.imageType(png), "png");
  assert.equal(avaliacoes.avatarPng(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  // Cabeçalho de PNG com o resto quebrado: não dá para ler
  assert.equal(avaliacoes.avatarPng(Buffer.concat([PNG.subarray(0, 16), Buffer.alloc(40)])), null);

  const r = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador });
  await assert.rejects(r.submit(envio({ photo: "data:image/svg+xml;base64,PHN2Zz4=" })), (e) => e.code === "bad_image");
  await assert.rejects(r.submit(envio({ photo: dataUrl(Buffer.from("não é imagem")) })), (e) => e.code === "bad_image");
  await r.submit(envio({ photo: dataUrl(PNG) }));
  const [a] = await r.review("pending");
  assert.equal(a.hasPhoto, true);
  assert.deepEqual(tamanhoPng(await r.avatar(a.id, { pending: true })), [96, 96]);
  assert.equal(await r.avatar(a.id), null, "foto de avaliação pendente não é pública");
  // "keep" mantém; null tira
  await r.submit(envio({ photo: "keep" }));
  assert.equal((await r.review("pending"))[0].hasPhoto, true);
  await r.submit(envio({ photo: null }));
  assert.equal((await r.review("pending"))[0].hasPhoto, false);
});

test("login: o ticket preenche provedor e foto, vale uma vez", async () => {
  const tickets = new Map([["t1", { provider: "github", providerHash: "h", name: "Ana GH", avatar: avaliacoes.avatarPng(PNG) }]]);
  const r = avaliacoes.createReviews({
    store: avaliacoes.memoryStore(),
    supporter: apoiador,
    identity: (t, navegador) => {
      if (navegador !== "nav-1") return null;
      const v = tickets.get(t);
      tickets.delete(t);
      return v ?? null;
    },
  });
  // De outro navegador, o ticket não serve (e continua valendo)
  await assert.rejects(r.submit(envio({ ticket: "t1" }), { browser: "outro" }), (e) => e.code === "login_expired");
  await r.submit(envio({ ticket: "t1", name: "Ana (editado)" }), { browser: "nav-1" });
  let [a] = await r.review("pending");
  assert.equal(a.provider, "github");
  assert.equal(a.verified, true);
  assert.equal(a.name, "Ana (editado)", "o nome digitado vale mais que o do provedor");
  assert.equal(a.hasPhoto, true);
  await assert.rejects(r.submit(envio({ ticket: "t1" }), { browser: "nav-1" }), (e) => e.code === "login_expired");
  // Reenviar sem login mantém o provedor; pedir anônimo tira o selo
  await r.submit(envio());
  assert.equal((await r.review("pending"))[0].provider, "github");
  await r.submit(envio({ provider: "anonymous" }));
  [a] = await r.review("pending");
  assert.equal(a.provider, "anonymous");
  assert.equal(a.verified, false);
});

test("mine: a pessoa recupera a própria avaliação para editar", async () => {
  const r = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador });
  assert.equal(await r.mine(APOIADOR.code), null);
  await r.submit(envio({ rating: 3 }));
  assert.equal((await r.mine(APOIADOR.code)).rating, 3);
  await assert.rejects(r.mine("CAFE-ZZZZ-ZZZZ"), (e) => e.code === "not_supporter");
});

// ── OAuth (provedor falso) ─────────────────────────────────────────────────
function provedorFalso({ foto = PNG, fotoHost = "https://avatars.githubusercontent.com/u/1?v=4" } = {}) {
  const chamadas = [];
  const fetch = async (url, init = {}) => {
    chamadas.push({ url: String(url), init });
    const u = new URL(url);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (u.hostname === "github.com" && u.pathname === "/login/oauth/access_token") return json({ access_token: "tok" });
    if (u.hostname === "api.github.com") return json({ id: 42, login: "ana", name: "Ana Souza", avatar_url: fotoHost });
    if (u.hostname === "avatars.githubusercontent.com")
      return { ok: true, status: 200, arrayBuffer: async () => foto.buffer.slice(foto.byteOffset, foto.byteOffset + foto.length) };
    return json({}, 404);
  };
  return { fetch, chamadas };
}

test("oauth: PKCE e state de uso único; o token não fica guardado", async () => {
  const { fetch, chamadas } = provedorFalso();
  const o = oauthMod.createOAuth({ credentials: { github: { id: "cid", secret: "sec" } }, render: avaliacoes.avatarPng, fetch });
  assert.deepEqual(o.providers(), ["github"]);
  assert.equal(o.start("google", { redirectUri: "x", lang: "en", browser: "nav-1" }), null, "provedor sem chave não existe");
  const ida = new URL(o.start("github", { redirectUri: "https://iconlibrary.io/api/reviews/auth/github/callback", lang: "pt-BR", browser: "nav-1" }));
  assert.equal(ida.searchParams.get("code_challenge_method"), "S256");
  const state = ida.searchParams.get("state");
  assert.ok(state.length >= 30);

  assert.deepEqual(await o.finish("github", { code: "c", state: "outro", browser: "nav-1" }), { lang: undefined, error: "state" });
  const volta = await o.finish("github", { code: "c", state, browser: "nav-1" });
  assert.equal(volta.lang, "pt-BR");
  assert.ok(volta.ticket);
  // O mesmo state não serve duas vezes
  assert.equal((await o.finish("github", { code: "c", state, browser: "nav-1" })).error, "state");
  // O verificador PKCE foi junto na troca do código
  const troca = chamadas.find((c) => c.url.includes("access_token"));
  assert.match(String(troca.init.body), /code_verifier=/);

  assert.equal(o.identity(volta.ticket, "outro"), null, "o ticket só vale no navegador que entrou");
  assert.equal(o.take(volta.ticket, "outro"), null);
  const id = o.identity(volta.ticket, "nav-1");
  assert.equal(id.provider, "github");
  assert.equal(id.name, "Ana Souza");
  assert.deepEqual(tamanhoPng(id.avatar), [96, 96]);
  assert.equal(id.providerHash, avaliacoes.providerHash("github", 42));
  assert.ok(!JSON.stringify(id).includes("tok"), "o token não é guardado");
  assert.ok(o.take(volta.ticket, "nav-1"));
  assert.equal(o.take(volta.ticket, "nav-1"), null);
});

test("oauth: quem recusa no provedor volta com erro; foto só dos domínios do provedor", async () => {
  const { fetch, chamadas } = provedorFalso({ fotoHost: "https://evil.example/foto.png" });
  const o = oauthMod.createOAuth({ credentials: { github: { id: "cid", secret: "sec" } }, render: avaliacoes.avatarPng, fetch });
  let state = new URL(o.start("github", { redirectUri: "r", lang: "en", browser: "nav-1" })).searchParams.get("state");
  assert.equal((await o.finish("github", { state, error: "access_denied", browser: "nav-1" })).error, "denied");
  // Login começado em outro navegador não é aceito aqui
  state = new URL(o.start("github", { redirectUri: "r", lang: "en", browser: "atacante" })).searchParams.get("state");
  assert.equal((await o.finish("github", { code: "c", state, browser: "nav-1" })).error, "state");
  state = new URL(o.start("github", { redirectUri: "r", lang: "en", browser: "nav-1" })).searchParams.get("state");
  const volta = await o.finish("github", { code: "c", state, browser: "nav-1" });
  assert.equal(o.identity(volta.ticket, "nav-1").avatar, null);
  assert.ok(!chamadas.some((c) => c.url.includes("evil.example")));
  assert.equal(oauthMod.hostAllowed("http://avatars.githubusercontent.com/x", ["avatars.githubusercontent.com"]), false);
  assert.equal(oauthMod.hostAllowed("https://lh3.googleusercontent.com/a", [/\.googleusercontent\.com$/]), true);
});

test("oauth: só os provedores com ID e segredo no ambiente", () => {
  assert.deepEqual(Object.keys(oauthMod.configured({ GITHUB_OAUTH_ID: "a", GITHUB_OAUTH_SECRET: "b", GOOGLE_OAUTH_ID: "c" })), ["github"]);
});

// ── Servidor ───────────────────────────────────────────────────────────────
const TOKEN = "t".repeat(40);
const json = { "Content-Type": "application/json" };
const admin = { Authorization: "Basic " + Buffer.from("admin:senha-admin").toString("base64") };
let base;
let instancia;
let rev;
let oauth;

before(async () => {
  const falso = provedorFalso();
  oauth = oauthMod.createOAuth({ credentials: { github: { id: "cid", secret: "sec" } }, render: avaliacoes.avatarPng, fetch: falso.fetch });
  rev = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador, identity: (t, b) => oauth.take(t, b) });
  instancia = servidor.createServer({ reviews: rev, oauth, adminPassword: "senha-admin", moderationToken: TOKEN });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("servidor: sem avaliações ligadas, a página recebe enabled false", async () => {
  const s = servidor.createServer({});
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  try {
    const u = `http://127.0.0.1:${s.address().port}`;
    assert.equal((await (await fetch(`${u}/api/reviews/config`)).json()).enabled, false);
    assert.equal((await (await fetch(`${u}/api/reviews`)).json()).enabled, false);
    assert.equal((await fetch(`${u}/api/reviews`, { method: "POST", headers: json, body: "{}" })).status, 503);
  } finally {
    s.close();
  }
});

test("servidor: enviar, moderar no /admin e aparecer na lista com a foto", async () => {
  const cfg = await (await fetch(`${base}/api/reviews/config`)).json();
  assert.deepEqual(cfg.providers, ["github"]);
  assert.equal((await fetch(`${base}/api/reviews`, { method: "POST", headers: json, body: JSON.stringify(envio({ code: "x" })) })).status, 403);
  const enviado = await fetch(`${base}/api/reviews`, { method: "POST", headers: json, body: JSON.stringify(envio({ photo: dataUrl(PNG) })) });
  assert.equal(enviado.status, 201);

  assert.equal((await fetch(`${base}/api/admin/reviews`)).status, 401);
  const { reviews } = await (await fetch(`${base}/api/admin/reviews?status=pending`, { headers: admin })).json();
  assert.equal(reviews.length, 1);
  const id = reviews[0].id;
  const fotoPendente = await fetch(`${base}/api/admin/reviews/${id}/avatar.png`, { headers: admin });
  assert.equal(fotoPendente.headers.get("content-type"), "image/png");
  assert.equal((await fetch(`${base}/api/reviews/${id}/avatar.png`)).status, 404, "antes de aprovar, a foto não é pública");

  assert.equal((await fetch(`${base}/api/admin/reviews/${id}/approve`, { method: "POST", headers: { ...admin, ...json }, body: "{}" })).status, 200);
  const lista = await (await fetch(`${base}/api/reviews`)).json();
  assert.equal(lista.total, 1);
  assert.equal(lista.reviews[0].name, "Ana");
  assert.ok(!JSON.stringify(lista).includes(APOIADOR.code));
  const foto = await fetch(`${base}${lista.reviews[0].avatar}`);
  assert.equal(foto.status, 200);
  assert.match(foto.headers.get("cache-control"), /max-age/);

  const mine = await (await fetch(`${base}/api/reviews/mine`, { method: "POST", headers: json, body: JSON.stringify({ code: APOIADOR.code }) })).json();
  assert.equal(mine.review.status, "approved");
});

test("servidor: API de moderação (n8n) com token, só o que espera", async () => {
  await fetch(`${base}/api/reviews`, { method: "POST", headers: json, body: JSON.stringify(envio({ code: OUTRO.code, name: "Bia" })) });
  assert.equal((await fetch(`${base}/api/moderation/reviews`)).status, 401);
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const { reviews } = await (await fetch(`${base}/api/moderation/reviews`, { headers: auth })).json();
  const bia = reviews.find((r) => r.name === "Bia");
  assert.ok(bia);
  assert.equal(bia.supporterCode, undefined);
  const corpo = JSON.stringify({ submittedAt: new Date(bia.submittedAt).getTime(), note: "Telegram: teste" });
  assert.equal((await fetch(`${base}/api/moderation/reviews/${bia.id}/reject`, { method: "POST", headers: { ...auth, ...json }, body: corpo })).status, 200);
  const de_novo = await fetch(`${base}/api/moderation/reviews/${bia.id}/approve`, { method: "POST", headers: { ...auth, ...json }, body: "{}" });
  assert.equal(de_novo.status, 409);
  assert.equal((await de_novo.json()).error, "not_pending");
});

test("servidor: login com GitHub volta para a página Sobre com o ticket no fragmento", async () => {
  const ida = await fetch(`${base}/api/reviews/auth/github?lang=pt-BR`, { redirect: "manual" });
  assert.equal(ida.status, 302);
  const cookie = ida.headers.get("set-cookie");
  assert.match(cookie, /^il_review_login=[\w-]+; Path=\/api\/reviews; Max-Age=1800; HttpOnly; SameSite=Lax/);
  const comCookie = { Cookie: cookie.split(";")[0] };
  const destino = new URL(ida.headers.get("location"));
  assert.equal(destino.hostname, "github.com");
  assert.equal(destino.searchParams.get("redirect_uri"), `${base}/api/reviews/auth/github/callback`);
  assert.equal((await fetch(`${base}/api/reviews/auth/google`, { redirect: "manual" })).status, 404);

  // Sem o cookie (outro navegador), a volta é recusada
  const semCookie = await fetch(`${base}/api/reviews/auth/github/callback?code=c&state=${destino.searchParams.get("state")}`, { redirect: "manual" });
  assert.match(semCookie.headers.get("location"), /#review-error=state$/);
  const ida2 = await fetch(`${base}/api/reviews/auth/github?lang=pt-BR`, { redirect: "manual", headers: comCookie });
  const state2 = new URL(ida2.headers.get("location")).searchParams.get("state");
  const volta = await fetch(`${base}/api/reviews/auth/github/callback?code=c&state=${state2}`, { redirect: "manual", headers: comCookie });
  assert.equal(volta.status, 302);
  const local = volta.headers.get("location");
  assert.match(local, /^\/about\.pt-BR\.html#review-ticket=[\w-]+$/);
  assert.equal(volta.headers.get("referrer-policy"), "no-referrer");
  const ticket = local.split("=")[1];

  assert.equal((await fetch(`${base}/api/reviews/identity`, { method: "POST", headers: json, body: JSON.stringify({ ticket }) })).status, 410);
  const id = await (await fetch(`${base}/api/reviews/identity`, { method: "POST", headers: { ...json, ...comCookie }, body: JSON.stringify({ ticket }) })).json();
  assert.equal(id.provider, "github");
  assert.match(id.photo, /^data:image\/png;base64,/);
  const erro = await fetch(`${base}/api/reviews/auth/github/callback?state=velho`, { redirect: "manual" });
  assert.match(erro.headers.get("location"), /^\/about\.html#review-error=state$/);
});

test("foto: imagem pequena que declara dimensões enormes é recusada sem decodificar", () => {
  // Cabeçalho de PNG 16000×16000 com o resto vazio: o tamanho vem do IHDR
  const bomba = Buffer.from(PNG);
  bomba.writeUInt32BE(16000, 16);
  bomba.writeUInt32BE(16000, 20);
  assert.deepEqual(avaliacoes.imageSize(bomba), { w: 16000, h: 16000 });
  const inicio = process.hrtime.bigint();
  assert.equal(avaliacoes.avatarPng(bomba), null);
  assert.ok(Number(process.hrtime.bigint() - inicio) / 1e6 < 200, "recusa antes de decodificar");
  // JPEG: as dimensões vêm do marcador SOF
  // SOI, um APP0 de 16 bytes e um SOF0 de 48 de altura por 64 de largura
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF "), 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  assert.deepEqual(avaliacoes.imageSize(jpeg), { w: 64, h: 48 });
});

test("texto: emoji conta como um caractere, igual ao banco; controles bidi saem", async () => {
  const r = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador });
  // 5 emojis = 10 unidades UTF-16, mas 5 caracteres: curto demais
  await assert.rejects(r.submit(envio({ comment: "😀😀😀😀😀" })), (e) => e.code === "too_short");
  await r.submit(envio({ comment: "😀".repeat(12), name: "Ana\u202Egnp.exe" }));
  const [a] = await r.review("pending");
  assert.equal(a.name, "Anagnp.exe");
  assert.equal([...a.comment].length, 12);
});

test("moderação: só a versão vista é decidida, de forma atômica", async () => {
  let agora = Date.parse("2026-11-11T12:00:00Z");
  const r = avaliacoes.createReviews({ store: avaliacoes.memoryStore(), supporter: apoiador, now: () => agora });
  await r.submit(envio());
  const [a] = await r.review("pending");
  agora += 3000;
  await r.submit(envio({ comment: "Trocado depois que a lista abriu." }));
  // O /admin manda a data em ISO; o n8n, em milissegundos
  await assert.rejects(r.decide(a.id, "approve", { seen: new Date(a.submittedAt).toISOString() }), (e) => e.code === "changed");
  await assert.rejects(r.decide(a.id, "delete", { seen: new Date(a.submittedAt).getTime() }), (e) => e.code === "changed");
  const [b] = await r.review("pending");
  await r.decide(b.id, "approve", { seen: new Date(b.submittedAt).toISOString() });
  assert.equal((await r.list()).total, 1);
});

test("servidor: foto pública com cache curto", async () => {
  const lista = await (await fetch(`${base}/api/reviews`)).json();
  const comFoto = lista.reviews.find((x) => x.avatar);
  assert.ok(comFoto);
  assert.equal((await fetch(`${base}${comFoto.avatar}`)).headers.get("cache-control"), "public, max-age=300");
});
