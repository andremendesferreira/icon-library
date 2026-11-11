// Páginas geradas (scripts/build-pages.mjs): breadcrumb na tela e em JSON-LD,
// e os passos ilustrados no topo do Guia, já traduzidos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const pasta = new URL("../public/", import.meta.url);
const geradas = readdirSync(pasta).filter((f) =>
  /^(guide|about|privacy|license|lucide-icons|feather-icons|bootstrap-icons|emoji-icons|lgpd-icon)(\.[\w-]+)?\.html$/.test(f),
);
const ler = (f) => readFileSync(new URL(f, pasta), "utf8");

test("toda página gerada tem breadcrumb com JSON-LD BreadcrumbList válido", () => {
  assert.ok(geradas.length >= 40);
  for (const f of geradas) {
    const html = ler(f);
    const ld = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html);
    assert.ok(ld, `${f}: sem JSON-LD`);
    const dados = JSON.parse(ld[1]);
    assert.equal(dados["@type"], "BreadcrumbList", f);
    assert.equal(dados.itemListElement.length, 2, f);
    assert.match(dados.itemListElement[1].item, new RegExp(`/${f.replace(/\./g, "\\.")}$`), f);
    assert.match(html, /<nav class="page__trilha" aria-label="[^"]+">/, `${f}: sem breadcrumb na tela`);
    assert.match(html, /<li aria-current="page">[^<]+<\/li>/, f);
  }
});

test("o Guia começa com os três passos ilustrados, traduzidos", () => {
  for (const f of geradas.filter((g) => g.startsWith("guide"))) {
    const html = ler(f);
    assert.equal((html.match(/<li class="passo">/g) || []).length, 3, f);
    assert.doesNotMatch(html, /data-i18n/, `${f}: texto não traduzido`);
  }
  assert.match(ler("guide.pt-BR.html"), /<h2 id="quick-start">Comece em 30 segundos<\/h2>/);
  assert.match(ler("guide.ja.html"), /鉛筆で編集/);
});
