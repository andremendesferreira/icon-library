// Traduções: todo idioma tem exatamente as chaves do inglês, com os mesmos
// marcadores ({name}…) e as mesmas tags nos textos com HTML; toda chave
// usada no HTML e no JS existe; as páginas de texto geradas estão em dia.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

import en from "../public/js/i18n/en.js";

const IDIOMAS = ["es", "fr", "de", "ru", "zh-CN", "pt-BR", "ja"];
const raiz = new URL("../", import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), "utf8");

const marcadores = (texto) => [...String(texto).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (texto) => [...String(texto).matchAll(/<\/?(\w+)/g)].map((m) => m[0]).sort();
const textos = (valor) => (typeof valor === "object" ? Object.values(valor) : [valor]);

for (const idioma of IDIOMAS) {
  test(`${idioma}: mesmas chaves, marcadores e tags do inglês`, async () => {
    const dic = (await import(`../public/js/i18n/${idioma}.js`)).default;
    assert.deepEqual(Object.keys(dic).sort(), Object.keys(en).sort());
    const regras = new Intl.PluralRules(idioma).resolvedOptions().pluralCategories;
    for (const [chave, original] of Object.entries(en)) {
      const traduzido = dic[chave];
      assert.equal(typeof traduzido, typeof original, `${chave}: tipo`);
      if (typeof original === "object") {
        assert.ok(traduzido.other, `${chave}: falta "other"`);
        for (const forma of Object.keys(traduzido))
          assert.ok(regras.includes(forma), `${chave}: "${forma}" não existe em ${idioma}`);
      }
      const esperado = marcadores(textos(original)[0]);
      for (const texto of textos(traduzido)) {
        assert.ok(texto.trim(), `${chave}: vazio`);
        assert.deepEqual(marcadores(texto), esperado, `${chave}: marcadores`);
        if (chave.endsWith("Html"))
          assert.deepEqual(tags(texto), tags(original), `${chave}: tags HTML`);
      }
    }
  });
}

test("toda chave usada no HTML e no JS existe no dicionário", () => {
  const html = ler("public/index.html");
  const usadas = new Set(
    [...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]),
  );
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g))
    for (const par of m[1].split(";")) usadas.add(par.split(":")[1]);
  const js = ["views", "controllers", "models"]
    .flatMap((pasta) =>
      readdirSync(new URL(`public/js/${pasta}/`, raiz)).map((f) => ler(`public/js/${pasta}/${f}`)),
    )
    .join("\n");
  for (const m of js.matchAll(/\bt\("([\w.]+)"/g)) usadas.add(m[1]);
  for (const m of js.matchAll(/(?:erroCom|erro|invalido)\("((?:error|ile)\.[\w]+)"/g)) usadas.add(m[1]);
  for (const m of js.matchAll(/rotuloGrupo\w*: "([\w.]+)"/g)) usadas.add(m[1]);
  const faltam = [...usadas].filter((chave) => !(chave in en));
  assert.deepEqual(faltam, []);
});

test("detect.js e os dicionários listam os mesmos idiomas", () => {
  const detect = ler("public/js/i18n/detect.js");
  const codigos = [...detect.matchAll(/\["([\w-]+)", "/g)].map((m) => m[1]);
  assert.deepEqual(codigos.sort(), ["en", ...IDIOMAS].sort());
});

test("páginas de texto geradas estão em dia (npm run pages)", () => {
  // --check falha se algum public/*.html difere do que o gerador produziria
  execFileSync(process.execPath, ["scripts/build-pages.mjs", "--check"], {
    cwd: new URL(raiz),
    stdio: "pipe",
  });
});
