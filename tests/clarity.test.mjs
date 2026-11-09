// Microsoft Clarity: carregado em todas as páginas públicas, e nada que seja
// código de apoiador, formulário ou código SVG pode aparecer nas gravações.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const pasta = new URL("../public/", import.meta.url);
const ler = (arquivo) => readFileSync(new URL(arquivo, pasta), "utf8");

test("todas as páginas carregam o clarity.js", () => {
  const paginas = readdirSync(pasta).filter((f) => f.endsWith(".html"));
  assert.ok(paginas.length > 10);
  for (const pagina of paginas)
    assert.match(ler(pagina), /<script src="js\/views\/clarity\.js" async><\/script>/, pagina);
});

test("áreas com dados de quem visita ficam mascaradas", () => {
  const html = ler("index.html");
  for (const id of ["publish", "coffee", "mine", "report", "scratchpad-text", "editor-code"]) {
    const tag = html.match(new RegExp(`<(?:dialog|textarea)[^>]*\\bid="${id}"[^>]*>`))?.[0];
    assert.ok(tag, id);
    assert.match(tag, /data-clarity-mask="true"/, id);
  }
});

test("o Clarity fica de fora em localhost", () => {
  assert.match(ler("js/views/clarity.js"), /localhost/);
});
