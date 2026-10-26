// Servidor: segurança (endereços malformados, fuga da pasta public),
// cabeçalhos, compressão, cache e as rotas geradas.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

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
  // Scripts são revalidados a cada visita (um deploy aparece na hora);
  // imagens podem ficar um dia em cache
  const primeira = await pedir("/js/app.js");
  assert.equal(primeira.headers["cache-control"], "no-cache");
  assert.match((await pedir("/img/logo-180.webp")).headers["cache-control"], /max-age=86400/);
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
    // Cada idioma: a página principal (?lang=) e as páginas de texto
    assert.match(sitemap, /<loc>https:\/\/icons\.example\.com\/\?lang=pt-BR<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/icons\.example\.com\/about\.ja\.html<\/loc>/);
    assert.equal((sitemap.match(/<loc>/g) || []).length, 1 + 7 + 24);
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

// O Dockerfile copia os arquivos do servidor um a um: um arquivo novo que
// ficasse de fora derrubaria o container ("Cannot find module")
test("Dockerfile: copia todo arquivo que o servidor carrega", () => {
  const exigir = createRequire(import.meta.url);
  exigir("../scripts/server.js");
  const pasta = fileURLToPath(new URL("../scripts/", import.meta.url));
  const carregados = Object.keys(exigir.cache)
    .filter((arquivo) => arquivo.startsWith(pasta))
    .map((arquivo) => path.basename(arquivo));
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  // admin.html é lido do disco a cada visita a /admin
  for (const nome of [...carregados, "admin.html"])
    assert.ok(dockerfile.includes(` scripts/${nome} `), `falta scripts/${nome} no Dockerfile`);
  assert.ok(carregados.includes("reports.js"));
});

// Página principal por idioma (/?lang=…): o cabeçalho já sai no idioma, para os
// buscadores não tratarem cada idioma como cópia da versão em inglês
const canonica = (html) => html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
const atributo = (html, regex) => html.match(regex)?.[1];

test("idioma: /?lang=pt-BR sai com lang, canonical, título e descrição em português", async () => {
  const res = await pedir("/?lang=pt-BR");
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-language"], "pt-BR");
  const html = res.corpo.toString();
  const pt = (await import("../public/js/i18n/pt-BR.js")).default;
  assert.match(html, /<html lang="pt-BR"/);
  assert.equal(canonica(html), "https://iconlibrary.io/?lang=pt-BR");
  assert.equal(atributo(html, /<meta property="og:url" content="([^"]+)"/), "https://iconlibrary.io/?lang=pt-BR");
  assert.equal(atributo(html, /<title>([^<]+)<\/title>/), pt["meta.title"]);
  assert.equal(atributo(html, /<meta\s+name="description"\s+content="([^"]+)"/), pt["meta.description"]);
  assert.equal(atributo(html, /<meta property="og:title" content="([^"]+)"/), pt["meta.title"]);
  // As versões por idioma (hreflang) continuam todas lá
  assert.equal((html.match(/hreflang=/g) ?? []).length, 9);
});

test("idioma: cada hreflang da página aponta para um endereço que se declara canônico", async () => {
  const html = (await pedir("/")).corpo.toString();
  const versoes = [...html.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)];
  assert.ok(versoes.length >= 8);
  for (const [, lang, href] of versoes) {
    const caminho = href.replace("https://iconlibrary.io", "");
    const pagina = (await pedir(caminho)).corpo.toString();
    assert.equal(canonica(pagina), href, `${lang}: ${caminho}`);
    if (lang !== "x-default") assert.match(pagina, new RegExp(`<html lang="${lang}"`), lang);
  }
});

test("idioma: inglês, código desconhecido e outros parâmetros", async () => {
  assert.equal(canonica((await pedir("/?lang=en")).corpo.toString()), "https://iconlibrary.io/");
  assert.equal(canonica((await pedir("/?lang=xx")).corpo.toString()), "https://iconlibrary.io/");
  assert.equal(canonica((await pedir("/?lang=%3Cscript%3E")).corpo.toString()), "https://iconlibrary.io/");
  // Maiúsculas trocadas valem; os outros parâmetros (busca, conjunto) não entram na canonical
  assert.equal(canonica((await pedir("/?set=lucide&q=arrow&lang=pt-br")).corpo.toString()), "https://iconlibrary.io/?lang=pt-BR");
  assert.equal(canonica((await pedir("/index.html?lang=de")).corpo.toString()), "https://iconlibrary.io/?lang=de");
});

test("idioma: ETag por idioma (304) e gzip", async () => {
  const primeira = await pedir("/?lang=ja");
  const etag = primeira.headers.etag;
  assert.match(etag, /-ja"$/);
  assert.notEqual(etag, (await pedir("/?lang=de")).headers.etag);
  assert.equal((await pedir("/?lang=ja", { headers: { "If-None-Match": etag } })).status, 304);
  const comprimida = await pedir("/?lang=ja", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(comprimida.headers["content-encoding"], "gzip");
  assert.equal(zlib.gunzipSync(comprimida.corpo).toString(), primeira.corpo.toString());
});

// Versão no rodapé: o commit em produção e a data do build
test("versão: lê o commit do HEAD solto, de refs/heads e de packed-refs", async () => {
  const { readCommit, versionHtml } = (await import("../scripts/version.js")).default;
  const os = await import("node:os");
  const fsp = await import("node:fs/promises");
  const sha = "9fb8dba0123456789abcdef0123456789abcdef0";
  const pasta = await fsp.mkdtemp(path.join(os.tmpdir(), "versao-"));
  // HEAD com o commit direto (checkout "solto")
  await fsp.writeFile(path.join(pasta, "HEAD"), sha + "\n");
  assert.equal(readCommit(pasta), sha);
  // HEAD apontando para a branch, com o commit em refs/heads/main
  await fsp.writeFile(path.join(pasta, "HEAD"), "ref: refs/heads/main\n");
  await fsp.mkdir(path.join(pasta, "refs", "heads"), { recursive: true });
  await fsp.writeFile(path.join(pasta, "refs", "heads", "main"), sha + "\n");
  assert.equal(readCommit(pasta), sha);
  // …ou só em packed-refs
  await fsp.rm(path.join(pasta, "refs"), { recursive: true });
  await fsp.writeFile(path.join(pasta, "packed-refs"), `# pack-refs with: peeled\n${sha} refs/heads/main\n`);
  assert.equal(readCommit(pasta), sha);
  // Sem .git, ou com um HEAD estranho: versão desconhecida, sem quebrar
  assert.equal(readCommit(path.join(pasta, "nao-existe")), null);
  await fsp.writeFile(path.join(pasta, "HEAD"), "ref: ../../etc/passwd\n");
  assert.equal(readCommit(pasta), null);
  await fsp.rm(pasta, { recursive: true });

  assert.equal(
    versionHtml({ commit: sha, built: "2026-10-26T12:00:00.000Z" }),
    `v <a href="https://github.com/andremendesferreira/icon-library/commit/${sha}" rel="noopener">9fb8dba</a> · 2026-10-26`,
  );
  assert.equal(versionHtml({ commit: null, built: null }), "");
});

test("versão: o rodapé das páginas mostra o commit em uso", async () => {
  const { readCommit } = (await import("../scripts/version.js")).default;
  const commit = readCommit(fileURLToPath(new URL("../.git", import.meta.url)));
  for (const caminho of ["/", "/?lang=pt-BR", "/guide.pt-BR.html"]) {
    const html = (await pedir(caminho)).corpo.toString();
    assert.doesNotMatch(html, /<!--version-->/, caminho);
    if (commit) assert.match(html, new RegExp(`/commit/${commit}" rel="noopener">${commit.slice(0, 7)}</a>`), caminho);
  }
});

test("versão: sem .git, pergunta ao GitHub o último commit; falha não quebra nada", async () => {
  const { latestCommitOnGitHub } = (await import("../scripts/version.js")).default;
  const sha = "4438870aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  let pedido;
  const respondeu = await latestCommitOnGitHub("main", async (url, opcoes) => {
    pedido = { url, opcoes };
    return { ok: true, json: async () => ({ sha }) };
  });
  assert.equal(respondeu, sha);
  assert.equal(pedido.url, "https://api.github.com/repos/andremendesferreira/icon-library/commits/main");
  assert.ok(pedido.opcoes.headers["User-Agent"]);
  // Erro HTTP, rede fora, resposta estranha: versão desconhecida
  assert.equal(await latestCommitOnGitHub("main", async () => ({ ok: false, json: async () => ({}) })), null);
  assert.equal(await latestCommitOnGitHub("main", async () => { throw new Error("sem rede"); }), null);
  assert.equal(await latestCommitOnGitHub("main", async () => ({ ok: true, json: async () => ({ sha: "<script>" }) })), null);
});
