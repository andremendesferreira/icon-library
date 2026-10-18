// Servidor: segurança (endereços malformados, fuga da pasta public),
// cabeçalhos, compressão, cache e as rotas geradas.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";

import servidor from "../scripts/server.js";

let base;
let instancia;

before(async () => {
  instancia = servidor.createServer();
  await new Promise((resolve) => instancia.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${instancia.address().port}`;
});

after(() => instancia.close());

// fetch normaliza "/../" e alguns escapes; aqui o caminho vai cru
function pedir(caminho, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${caminho}`, { method, headers }, (res) => {
      const partes = [];
      res.on("data", (parte) => partes.push(parte));
      res.on("end", () =>
        resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes) }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

test("página principal com cabeçalhos de segurança", async () => {
  const res = await pedir("/");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/html/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["cache-control"], "no-cache");
  assert.match(res.corpo.toString(), /<title>Icon Library/);
});

test("endereço malformado responde 400 e o servidor continua de pé", async () => {
  assert.equal((await pedir("/%E0%A4%A")).status, 400);
  assert.equal((await pedir("/")).status, 200);
});

test("não serve nada fora da pasta public", async () => {
  for (const caminho of ["/../package.json", "/..%2fpackage.json", "/%2e%2e/scripts/server.js"]) {
    const res = await pedir(caminho);
    assert.ok([403, 404].includes(res.status), `${caminho} → ${res.status}`);
    assert.doesNotMatch(res.corpo.toString(), /"name": "icon-library"|createServer/);
  }
});

test("só GET e HEAD", async () => {
  const post = await pedir("/", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
  const head = await pedir("/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.corpo.length, 0);
});

test("gzip quando o navegador aceita", async () => {
  const res = await pedir("/css/icon-library.css", {
    headers: { "Accept-Encoding": "gzip, br" },
  });
  assert.equal(res.headers["content-encoding"], "gzip");
  assert.match(zlib.gunzipSync(res.corpo).toString(), /\.emoji-card/);
  const semGzip = await pedir("/css/icon-library.css");
  assert.equal(semGzip.headers["content-encoding"], undefined);
});

test("ETag: 304 quando o arquivo não mudou", async () => {
  const primeira = await pedir("/js/app.js");
  assert.match(primeira.headers["cache-control"], /max-age=86400/);
  const segunda = await pedir("/js/app.js", {
    headers: { "If-None-Match": primeira.headers.etag },
  });
  assert.equal(segunda.status, 304);
  assert.equal(segunda.corpo.length, 0);
});

test("404 para arquivo inexistente", async () => {
  assert.equal((await pedir("/nada.js")).status, 404);
});

test("robots.txt e sitemap.xml com o endereço do site", async () => {
  process.env.SITE_URL = "https://icons.example.com/";
  try {
    const robots = (await pedir("/robots.txt")).corpo.toString();
    assert.match(robots, /Sitemap: https:\/\/icons\.example\.com\/sitemap\.xml/);
    const sitemap = (await pedir("/sitemap.xml")).corpo.toString();
    assert.match(sitemap, /<loc>https:\/\/icons\.example\.com\/privacy\.html<\/loc>/);
  } finally {
    delete process.env.SITE_URL;
  }
});

test("ads.txt só com um ID de editor válido", async () => {
  assert.equal((await pedir("/ads.txt")).status, 404);
  process.env.ADSENSE_PUBLISHER_ID = "ca-pub-1234567890";
  try {
    const res = await pedir("/ads.txt");
    assert.equal(res.status, 200);
    assert.equal(
      res.corpo.toString(),
      "google.com, pub-1234567890, DIRECT, f08c47fec0942fa0\n",
    );
  } finally {
    delete process.env.ADSENSE_PUBLISHER_ID;
  }
});
