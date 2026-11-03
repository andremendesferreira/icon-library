// IndexNow: chave válida, arquivo /<chave>.txt servido pelo servidor e o envio
// do sitemap no formato que a API espera (sem chamar a internet).
import { test } from "node:test";
import assert from "node:assert/strict";

import indexnow from "../scripts/indexnow.js";
import servidor from "../scripts/server.js";

const CHAVE = "0123456789abcdef0123456789abcdef";

test("indexnow: só aceita chave de 8 a 128 letras, números ou hífens", () => {
  assert.equal(indexnow.indexNowKey({ INDEXNOW_KEY: ` ${CHAVE} ` }), CHAVE);
  assert.equal(indexnow.indexNowKey({}), "");
  assert.equal(indexnow.indexNowKey({ INDEXNOW_KEY: "curta" }), "");
  assert.equal(indexnow.indexNowKey({ INDEXNOW_KEY: "com/barra/123" }), "");
  assert.equal(indexnow.indexNowKey({ INDEXNOW_KEY: "x".repeat(129) }), "");
});

test("indexnow: envia host, chave, local da chave e endereços num só POST", async () => {
  let pedido;
  const fetchImpl = async (url, opcoes) => {
    pedido = { url, ...opcoes, corpo: JSON.parse(opcoes.body) };
    return { status: 202 };
  };
  const urls = ["https://iconlibrary.io/", "https://iconlibrary.io/guide.html"];
  const status = await indexnow.submitIndexNow({ site: "https://iconlibrary.io", key: CHAVE, urls, fetchImpl });
  assert.equal(status, 202);
  assert.equal(pedido.url, indexnow.ENDPOINT);
  assert.equal(pedido.method, "POST");
  assert.deepEqual(pedido.corpo, {
    host: "iconlibrary.io",
    key: CHAVE,
    keyLocation: `https://iconlibrary.io/${CHAVE}.txt`,
    urlList: urls,
  });
  assert.equal(indexnow.describeStatus(202), "202 accepted, key still being checked");
  assert.match(indexnow.describeStatus(500), /unexpected/);
});

test("indexnow: o servidor responde /<chave>.txt só com a chave configurada", async () => {
  const pedir = async (instancia, caminho) => {
    await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
    try {
      const r = await fetch(`http://127.0.0.1:${instancia.address().port}${caminho}`);
      return { status: r.status, texto: await r.text(), tipo: r.headers.get("content-type") };
    } finally {
      instancia.close();
    }
  };
  const com = await pedir(servidor.createServer({ indexNowKey: CHAVE }), `/${CHAVE}.txt`);
  assert.equal(com.status, 200);
  assert.equal(com.texto, CHAVE);
  assert.match(com.tipo, /^text\/plain/);
  assert.equal((await pedir(servidor.createServer(), `/${CHAVE}.txt`)).status, 404);
  assert.equal((await pedir(servidor.createServer({ indexNowKey: CHAVE }), "/outra-chave-qualquer.txt")).status, 404);
});

test("indexnow: os endereços enviados são os do sitemap, com o endereço público", () => {
  const urls = servidor.sitemapUrls("https://iconlibrary.io");
  assert.equal(urls[0], "https://iconlibrary.io/");
  assert.ok(urls.includes("https://iconlibrary.io/lgpd-icon.pt-BR.html"));
  assert.ok(urls.includes("https://iconlibrary.io/?lang=ja"));
  assert.ok(urls.every((u) => u.startsWith("https://iconlibrary.io/")));
});
