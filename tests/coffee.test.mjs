// "Pague um café": confirmação no Stripe (simulado), código de apoiador,
// validade de 30 dias, limite de aparelhos e a API do servidor.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import cafe from "../scripts/coffee.js";
import servidor from "../scripts/server.js";

const { createCoffee, memoryStore, normalizeCode, DAYS, MAX_DEVICES } = cafe;
const DIA = 86400000;
const PAGO_EM = Date.UTC(2026, 9, 1) / 1000; // 1º/out/2026, em segundos (como o Stripe)

// Stripe de mentira: só conhece as sessões deste objeto
function stripeFalso(sessoes) {
  const chamadas = [];
  const fetch = async (url, opcoes) => {
    chamadas.push({ url, auth: opcoes.headers.Authorization });
    const id = decodeURIComponent(url.split("/").pop());
    const sessao = sessoes[id];
    if (!sessao) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => sessao };
  };
  return { fetch, chamadas };
}

const PAGA = { status: "complete", payment_status: "paid", created: PAGO_EM, amount_total: 300, currency: "usd", payment_link: "plink_1" };

function servico({ sessoes = { cs_test_pago123456: PAGA }, agora = PAGO_EM * 1000 + DIA, ...extra } = {}) {
  const stripe = stripeFalso(sessoes);
  return {
    stripe,
    cafe: createCoffee({
      stripeKey: "sk_test_x",
      paymentLink: "https://buy.stripe.com/test",
      store: memoryStore(),
      fetch: stripe.fetch,
      now: () => agora,
      ...extra,
    }),
  };
}

test("pagamento confirmado vira código válido por 30 dias a partir do pagamento", async () => {
  const { cafe: c, stripe } = servico();
  const r = await c.redeem("cs_test_pago123456");
  assert.match(r.code, /^CAFE-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(r.expires, new Date(PAGO_EM * 1000 + DAYS * DIA).toISOString());
  assert.equal(stripe.chamadas[0].auth, "Bearer sk_test_x");
  // Recarregar a página de agradecimento devolve o mesmo código, sem perguntar ao Stripe
  assert.deepEqual(await c.redeem("cs_test_pago123456"), r);
  assert.equal(stripe.chamadas.length, 1);
});

test("sessão não paga, desconhecida, de outro link ou malformada é recusada", async () => {
  const { cafe: c } = servico({
    sessoes: {
      cs_test_aberta12345: { ...PAGA, status: "open", payment_status: "unpaid" },
      cs_test_outrolink12: { ...PAGA, payment_link: "plink_2" },
    },
    paymentLinkId: "plink_1",
  });
  await assert.rejects(c.redeem("cs_test_aberta12345"), { status: 402, code: "not_paid" });
  await assert.rejects(c.redeem("cs_test_naoexiste1"), { status: 404, code: "unknown_session" });
  await assert.rejects(c.redeem("cs_test_outrolink12"), { status: 403, code: "other_payment" });
  await assert.rejects(c.redeem("'; DROP TABLE x"), { status: 400, code: "bad_session" });
});

test("pagamento de mais de 30 dias atrás não libera nada", async () => {
  const { cafe: c } = servico({ agora: PAGO_EM * 1000 + (DAYS + 1) * DIA });
  await assert.rejects(c.redeem("cs_test_pago123456"), { status: 410, code: "expired" });
});

test("código vale em outros aparelhos até o limite", async () => {
  const { cafe: c } = servico();
  const { code } = await c.redeem("cs_test_pago123456"); // 1º aparelho
  for (let i = 2; i <= MAX_DEVICES; i++) assert.equal((await c.claim(code)).code, code);
  await assert.rejects(c.claim(code), { status: 409, code: "too_many_devices" });
});

test("código é aceito com minúsculas, espaços e sem o prefixo", async () => {
  const { cafe: c } = servico();
  const { code } = await c.redeem("cs_test_pago123456");
  const corpo = code.slice(5).replace("-", "");
  assert.equal(normalizeCode(` ${corpo.toLowerCase()} `), code);
  assert.equal((await c.claim(corpo.toLowerCase())).code, code);
  await assert.rejects(c.claim("CAFE-AAAA-AAAA"), { status: 404, code: "invalid_code" });
  await assert.rejects(c.claim("xyz"), { status: 404, code: "invalid_code" });
});

test("código vencido não vale mais", async () => {
  let agora = PAGO_EM * 1000 + DIA;
  const { cafe: c } = servico({ now: () => agora });
  const { code } = await c.redeem("cs_test_pago123456");
  agora = PAGO_EM * 1000 + (DAYS + 1) * DIA;
  // Vencido é diferente de inexistente: a página oferece renovar o mesmo código
  await assert.rejects(c.claim(code), { status: 410, code: "code_expired" });
  assert.equal(await c.supporter(code), null);
});

// Renovação: o código vai no link do Stripe (client_reference_id)
const renovacao = (code, dias) => ({ ...PAGA, created: PAGO_EM + dias * 86400, client_reference_id: code });

test("renovar antes de vencer soma 30 dias ao fim do período, com o mesmo código", async () => {
  let agora = PAGO_EM * 1000 + DIA;
  const sessoes = { cs_test_pago123456: PAGA };
  const { cafe: c, stripe } = servico({ sessoes, now: () => agora });
  const { code } = await c.redeem("cs_test_pago123456");
  await c.claim(code);
  await c.claim(code);
  await assert.rejects(c.claim(code), { code: "too_many_devices" });

  agora = PAGO_EM * 1000 + 20 * DIA;
  sessoes.cs_test_renova12345 = renovacao(code.toLowerCase().replace(/-/g, " "), 20);
  const r = await c.redeem("cs_test_renova12345");
  assert.equal(r.code, code);
  assert.equal(r.expires, new Date(PAGO_EM * 1000 + 2 * DAYS * DIA).toISOString());
  // Recarregar a página não renova de novo nem pergunta ao Stripe
  const chamadas = stripe.chamadas.length;
  assert.deepEqual(await c.redeem("cs_test_renova12345"), r);
  assert.equal(stripe.chamadas.length, chamadas);
  // Os aparelhos recomeçam: quem pagou é o primeiro do novo período
  await c.claim(code);
  await c.claim(code);
  await assert.rejects(c.claim(code), { code: "too_many_devices" });
});

test("renovar depois de vencer conta 30 dias a partir do novo pagamento", async () => {
  let agora = PAGO_EM * 1000 + DIA;
  const sessoes = { cs_test_pago123456: PAGA };
  const { cafe: c } = servico({ sessoes, now: () => agora });
  const { code } = await c.redeem("cs_test_pago123456");
  agora = PAGO_EM * 1000 + 45 * DIA;
  assert.equal(await c.supporter(code), null);
  sessoes.cs_test_renova12345 = renovacao(code, 45);
  const r = await c.redeem("cs_test_renova12345");
  assert.equal(r.code, code);
  assert.equal(r.expires, new Date(PAGO_EM * 1000 + (45 + DAYS) * DIA).toISOString());
  assert.equal((await c.supporter(code)).code, code);
});

test("renovação com código desconhecido vira código novo; pagamento velho não renova", async () => {
  let agora = PAGO_EM * 1000 + DIA;
  const sessoes = { cs_test_pago123456: PAGA, cs_test_outro123456: renovacao("CAFE-ZZZZ-ZZZZ", 0) };
  const { cafe: c } = servico({ sessoes, now: () => agora });
  const { code } = await c.redeem("cs_test_pago123456");
  const outro = await c.redeem("cs_test_outro123456");
  assert.notEqual(outro.code, "CAFE-ZZZZ-ZZZZ");
  assert.notEqual(outro.code, code);

  agora = PAGO_EM * 1000 + 100 * DIA;
  sessoes.cs_test_velho123456 = renovacao(code, 40);
  await assert.rejects(c.redeem("cs_test_velho123456"), { status: 410, code: "expired" });
  assert.equal(await c.supporter(code), null);
});

// ── API do servidor ─────────────────────────────────────────────────────────
let base;
let instancia;
let desligado;
let baseDesligado;

before(async () => {
  instancia = servidor.createServer({ coffee: servico().cafe });
  desligado = servidor.createServer();
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  await new Promise((r) => desligado.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
  baseDesligado = `http://127.0.0.1:${desligado.address().port}`;
});

after(() => {
  instancia.close();
  desligado.close();
});

const postar = (raiz, rota, corpo) =>
  fetch(`${raiz}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

test("API: sem Stripe configurado o café fica desligado", async () => {
  assert.deepEqual(await (await fetch(`${baseDesligado}/api/coffee/config`)).json(), { enabled: false });
  assert.equal((await postar(baseDesligado, "/api/coffee/redeem", { session: "cs_test_pago123456" })).status, 503);
});

test("API: configuração, resgate e código em outro aparelho", async () => {
  const config = await (await fetch(`${base}/api/coffee/config`)).json();
  assert.deepEqual(config, { enabled: true, link: "https://buy.stripe.com/test", days: 30, devices: 3, price: "US$ 3" });

  const resgate = await postar(base, "/api/coffee/redeem", { session: "cs_test_pago123456" });
  assert.equal(resgate.status, 200);
  assert.equal(resgate.headers.get("cache-control"), "no-store");
  const { code } = await resgate.json();
  const outro = await postar(base, "/api/coffee/claim", { code });
  assert.equal(outro.status, 200);
  assert.equal((await outro.json()).code, code);
});

test("API: erros viram JSON com código; método e corpo são conferidos", async () => {
  const naoPago = await postar(base, "/api/coffee/redeem", { session: "cs_test_naoexiste1" });
  assert.equal(naoPago.status, 404);
  assert.deepEqual(await naoPago.json(), { error: "unknown_session" });
  assert.equal((await postar(base, "/api/coffee/redeem", "{quebrado")).status, 400);
  assert.equal((await postar(base, "/api/coffee/redeem", JSON.stringify({ session: "x".repeat(5000) }))).status, 413);
  assert.equal((await fetch(`${base}/api/coffee/redeem`)).status, 405);
  assert.equal((await fetch(`${base}/api/nada`)).status, 404);
});

test("API: tentativas demais de código são bloqueadas", async () => {
  const servidorLimite = servidor.createServer({ coffee: servico().cafe });
  await new Promise((r) => servidorLimite.listen(0, "127.0.0.1", r));
  const raiz = `http://127.0.0.1:${servidorLimite.address().port}`;
  try {
    const status = [];
    for (let i = 0; i < 12; i++) status.push((await postar(raiz, "/api/coffee/claim", { code: "CAFE-AAAA-AAAA" })).status);
    assert.deepEqual(status.slice(0, 10), Array(10).fill(404));
    assert.deepEqual(status.slice(10), [429, 429]);
  } finally {
    servidorLimite.close();
  }
});
