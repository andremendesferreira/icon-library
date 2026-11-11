// Content-Security-Policy (scripts/csp.js): o mínimo valendo em toda resposta,
// a política completa em observação nas páginas, a estrita no /admin, e os
// relatos resumidos sem dados de quem visita.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import csp from "../scripts/csp.js";
import servidor from "../scripts/server.js";
import relatos from "../scripts/reports.js";

let base;
let instancia;
before(async () => {
  instancia = servidor.createServer({ reports: relatos.createReports({ store: relatos.memoryStore() }), adminPassword: "senha-admin" });
  await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${instancia.address().port}`;
});
after(() => instancia.close());

test("toda resposta leva a CSP mínima; páginas também a completa em observação", async () => {
  for (const caminho of ["/", "/guide.html", "/about.pt-BR.html", "/api/health", "/css/icon-library.css"]) {
    const r = await fetch(base + caminho);
    const politica = r.headers.get("content-security-policy");
    assert.match(politica, /object-src 'none'/, caminho);
    assert.match(politica, /base-uri 'self'/, caminho);
    assert.match(politica, /frame-ancestors 'self'/, caminho);
    assert.doesNotMatch(politica, /script-src/, `${caminho}: o mínimo não restringe scripts (AdSense e Clarity)`);
    const observacao = r.headers.get("content-security-policy-report-only");
    if (r.headers.get("content-type").startsWith("text/html")) {
      assert.match(observacao, /script-src 'self' [^;]*pagead2\.googlesyndication\.com[^;]*www\.clarity\.ms/, caminho);
      assert.doesNotMatch(observacao, /script-src[^;]*'unsafe-inline'/, `${caminho}: sem script em linha`);
      assert.match(observacao, /report-uri \/api\/csp-report/);
      assert.match(r.headers.get("reporting-endpoints"), /csp="\/api\/csp-report"/);
    } else assert.equal(observacao, null, caminho);
  }
});

test("as páginas não têm JavaScript em linha nem atributos on*", () => {
  // Se um dia tiverem, a política em observação precisa de nonce/hash
  const pasta = new URL("../public/", import.meta.url);
  for (const f of readdirSync(pasta).filter((n) => n.endsWith(".html"))) {
    const html = readFileSync(new URL(f, pasta), "utf8");
    for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
      const atributos = m[1] ?? "";
      if (/\ssrc=/.test(atributos)) continue;
      assert.match(atributos, /type="application\/(ld\+)?json"/, `${f}: script em linha que roda código`);
    }
    assert.doesNotMatch(html, /\son[a-z]+="/i, `${f}: atributo on*`);
  }
});

test("/admin: CSP estrita, com o hash exato do script e do estilo da página", async () => {
  const auth = { Authorization: "Basic " + Buffer.from("admin:senha-admin").toString("base64") };
  const r = await fetch(`${base}/admin`, { headers: auth });
  assert.equal(r.status, 200);
  const politica = r.headers.get("content-security-policy");
  const html = await r.text();
  const hash = (tag) => {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(html);
    return `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`;
  };
  assert.match(politica, /^default-src 'none'/);
  assert.ok(politica.includes(`script-src ${hash("script")}`), "o script do /admin roda");
  assert.ok(politica.includes(`style-src ${hash("style")}`), "o estilo do /admin aplica");
  assert.match(politica, /frame-ancestors 'none'/);
  assert.equal(r.headers.get("content-security-policy-report-only"), null);
});

test("relatos: uma linha curta por tipo, sem endereço completo nem busca", async () => {
  const linhas = [];
  const r = csp.createCspReports({ log: (l) => linhas.push(l) });
  const relato = {
    "csp-report": {
      "document-uri": "https://iconlibrary.io/?q=meu+nome&lang=pt-BR",
      "effective-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/x.js?token=abc",
    },
  };
  assert.equal(r.record(relato), 1);
  assert.equal(r.record(relato), 0, "o mesmo tipo não se repete no log");
  r.record([{ type: "csp-violation", body: { documentURL: "https://iconlibrary.io/guide.html", effectiveDirective: "frame-src", blockedURL: "https://ads.example/f" } }]);
  assert.deepEqual(linhas, [
    "[csp] would block: script-src-elem evil.example on /",
    "[csp] would block: frame-src ads.example on /guide.html",
  ]);
  assert.ok(!linhas.join().includes("meu") && !linhas.join().includes("token"));
});

test("servidor: /api/csp-report aceita o relato e responde 204", async () => {
  const corpo = JSON.stringify({ "csp-report": { "document-uri": "http://x/", "effective-directive": "img-src", "blocked-uri": "https://a.example/i.png" } });
  const r = await fetch(`${base}/api/csp-report`, { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: corpo });
  assert.equal(r.status, 204);
  assert.equal((await fetch(`${base}/api/csp-report`)).status, 405);
  // Lixo também recebe 204, sem erro
  assert.equal((await fetch(`${base}/api/csp-report`, { method: "POST", body: "não é json" })).status, 204);
});
