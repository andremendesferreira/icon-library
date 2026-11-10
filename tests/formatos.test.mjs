// Formatos do menu ⋯ dos cards (Vue, Svelte, data URI, CSS) e a opção
// "Decorativo" (aria-hidden) aplicada a tudo o que é copiado.
import { test } from "node:test";
import assert from "node:assert/strict";

import { aplicarEstilo, paraCss, paraDataUri, paraSvelte, paraVue } from "../public/js/models/svgTools.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/></svg>';

test("decorativo: aria-hidden só na tag de fora, uma vez", () => {
  const comAria = aplicarEstilo(SVG, { tamanho: 24, traco: 2, cor: null, decorativo: true });
  assert.match(comAria, /^<svg[^>]* aria-hidden="true">/);
  assert.equal(aplicarEstilo(comAria, { tamanho: 24, traco: 2, cor: null, decorativo: true }).match(/aria-hidden/g).length, 1);
  assert.doesNotMatch(aplicarEstilo(SVG, { tamanho: 24, traco: 2, cor: null, decorativo: false }), /aria-hidden/);
});

test("Vue e Svelte: o <svg> recebe o que é passado ao componente", () => {
  assert.equal(paraVue(SVG), `<template>\n  ${SVG}\n</template>\n`);
  const svelte = paraSvelte(SVG);
  assert.match(svelte, /^<svg [^>]*stroke-width="2" \{\.\.\.\$\$restProps\}>/);
  assert.ok(svelte.endsWith("</svg>\n"));
});

test("data URI: legível, sem aspas duplas e com a cor no lugar de currentColor", () => {
  const uri = paraDataUri(SVG, "#e11d48");
  assert.ok(uri.startsWith("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'"));
  assert.ok(uri.includes("stroke='%23e11d48'"));
  assert.doesNotMatch(uri, /["<>#]|currentColor/);
  // A volta dá o mesmo desenho
  assert.equal(decodeURIComponent(uri.slice("data:image/svg+xml,".length)), SVG.replace(/"/g, "'").replace("currentColor", "#e11d48"));
});

test("CSS: máscara com a cor do texto nos vetoriais, fundo no emoji", () => {
  const css = paraCss(SVG, "arrow up", { tamanho: 32 });
  assert.match(css, /^\.icon-arrow-up \{/);
  assert.match(css, /width: 32px;/);
  assert.match(css, /background-color: currentColor;/);
  assert.match(css, /-webkit-mask: url\("data:image\/svg\+xml,[^"]+"\) no-repeat center \/ contain;/);
  const emoji = paraCss(SVG, "smile", { mascara: false });
  assert.doesNotMatch(emoji, /mask/);
  assert.match(emoji, /background: url\("data:image\/svg\+xml,/);
});
