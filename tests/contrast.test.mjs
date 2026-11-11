// Contraste do texto (WCAG AA, 4,5:1). Os cinzas e azuis abaixo ficavam entre
// 2:1 e 4:1 no fundo claro; texto secundário usa var(--il-muted), que tem um
// valor para cada tema, e texto azul usa var(--il-blue-dark).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/css/icon-library.css", import.meta.url), "utf8");
const lum = (hex) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("nenhum texto usa os cinzas e azuis de pouco contraste", () => {
  const fracos = /(?:^|[;\s{])color:\s*(#7f8c8d|#8a99a8|#95a5a6|#a3b0bd|#2980b9|#3498db|#a8791a|var\(--il-blue\))/gi;
  assert.deepEqual([...css.matchAll(fracos)].map((m) => m[1]), []);
});

test("os tokens de texto passam de 4,5:1 nos fundos do tema claro", () => {
  const token = (nome) => css.match(new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, "i"))[1];
  for (const fundo of ["#ffffff", "#f5f7fb", "#eef4ff"]) {
    assert.ok(contraste(token("il-muted"), fundo) >= 4.5, `il-muted em ${fundo}`);
    assert.ok(contraste(token("il-warn"), fundo) >= 4.5, `il-warn em ${fundo}`);
  }
  assert.ok(contraste("#ffffff", token("il-action")) >= 4.5, "branco no botão azul");
  assert.ok(contraste("#ffffff", token("il-action-hover")) >= 4.5, "branco no botão azul (hover)");
});

// Borda de controle (WCAG 1.4.11): a borda que identifica a busca e os campos
// precisa de 3:1 contra o que está em volta, nos dois temas
test("a borda forte dos controles passa de 3:1 nos dois temas", () => {
  const [claro, escuro] = [...css.matchAll(/--cor-borda-forte:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
  const valor = (nome) => css.match(new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, "i"))[1];
  for (const fundo of ["#ffffff", valor("cor-fundo")]) assert.ok(contraste(claro, fundo) >= 3, `claro em ${fundo}`);
  for (const fundo of [valor("dk-surface"), valor("dk-bg")]) assert.ok(contraste(escuro, fundo) >= 3, `escuro em ${fundo}`);
});
