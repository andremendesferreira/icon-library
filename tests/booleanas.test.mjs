// Unir, Subtrair, Interseção e Excluir: as contas do Paper.js (o mesmo
// arquivo que o site serve) e o que o editor faz com o resultado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { combinarCaminhos } from "../public/js/models/booleanas.js";
import { EditorModel } from "../public/js/models/EditorModel.js";
import { limitesDoElemento, lerPath } from "../public/js/models/svgGeometry.js";

const require = createRequire(import.meta.url);
const paper = require("paper/dist/paper-core.js");
paper.setup(new paper.Size(1, 1));
const motor = (op, caminhos) => combinarCaminhos(paper, op, caminhos);

test("o arquivo servido pelo site é o mesmo do pacote fixado nas devDependencies", () => {
  const site = readFileSync(new URL("../public/js/vendor/paper-core.min.js", import.meta.url));
  const pacote = readFileSync(require.resolve("paper/dist/paper-core.min.js"));
  assert.ok(site.equals(pacote));
  assert.equal(require("paper/package.json").version, "0.12.18");
});

const doc = (elementos) => ({
  raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
  elementos,
});
const CIRCULO = { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } };
const BARRA = { tag: "rect", attrs: { x: "2", y: "10", width: "20", height: "4", stroke: "#ff0000" } };

function editor(elementos) {
  const m = new EditorModel();
  m.definirDocumento(doc(elementos), "teste");
  m.selecionarTudo();
  return m;
}
const caixa = (m) => limitesDoElemento(m.elementos[m.selecionado]);

test("unir: duas formas viram um path só, com o estilo da de baixo e curvas mantidas", () => {
  const m = editor([CIRCULO, BARRA]);
  assert.equal(m.podeCombinarFormas("unir"), true);
  assert.deepEqual(m.combinarFormas("unir", motor), { ok: true });
  assert.equal(m.elementos.length, 1);
  const el = m.elementos[0];
  assert.equal(el.tag, "path");
  assert.equal(el.attrs.stroke, undefined, "fica o estilo da forma de baixo (o círculo)");
  assert.equal(el.attrs.r, undefined);
  assert.ok(lerPath(el.attrs.d).some((c) => c.t === "C"), "o arco do círculo continua curva");
  const b = caixa(m);
  assert.ok(Math.abs(b.minX - 2) < 0.01 && Math.abs(b.maxX - 22) < 0.01);
  // Desfazer volta as duas formas
  m.desfazer();
  assert.equal(m.elementos.length, 2);
});

test("subtrair: a de cima recorta a de baixo e some", () => {
  const m = editor([CIRCULO, BARRA]);
  assert.equal(m.combinarFormas("subtrair", motor).ok, true);
  assert.equal(m.elementos.length, 1);
  const d = m.elementos[0].attrs.d;
  assert.equal((d.match(/M/g) || []).length, 2, "duas metades do círculo");
  assert.equal(m.elementos[0].attrs["fill-rule"], "evenodd");
});

test("interseção e excluir", () => {
  let m = editor([CIRCULO, BARRA]);
  assert.equal(m.combinarFormas("intersecao", motor).ok, true);
  const b = caixa(m);
  assert.ok(Math.abs(b.minY - 10) < 0.01 && Math.abs(b.maxY - 14) < 0.01, "só a faixa em comum");
  m = editor([CIRCULO, BARRA]);
  assert.equal(m.combinarFormas("excluir", motor).ok, true);
  assert.ok((m.elementos[0].attrs.d.match(/M/g) || []).length >= 2);
});

test("seleção que não serve: linha aberta, uma forma só, três para subtrair", () => {
  const linha = { tag: "line", attrs: { x1: "2", y1: "2", x2: "22", y2: "22" } };
  assert.equal(editor([CIRCULO, linha]).podeCombinarFormas("unir"), false, "linha aberta");
  assert.equal(editor([CIRCULO]).podeCombinarFormas("unir"), false, "uma forma só");
  const tres = editor([CIRCULO, BARRA, { tag: "rect", attrs: { x: "0", y: "0", width: "4", height: "4" } }]);
  assert.equal(tres.podeCombinarFormas("unir"), true, "unir aceita três");
  assert.equal(tres.podeCombinarFormas("subtrair"), false, "subtrair usa exatamente duas");
  assert.deepEqual(tres.combinarFormas("subtrair", motor), { ok: false, motivo: "selecao" });
});

test("formas que não se tocam: a interseção não deixa nada e nada muda", () => {
  const longe = { tag: "rect", attrs: { x: "30", y: "30", width: "4", height: "4" } };
  const m = editor([CIRCULO, longe]);
  assert.deepEqual(m.combinarFormas("intersecao", motor), { ok: false, motivo: "vazio" });
  assert.equal(m.elementos.length, 2);
  assert.equal(m.podeDesfazer, false, "não vira passo do histórico");
});

test("unir três formas, inclusive polígono", () => {
  const tri = { tag: "polygon", attrs: { points: "12,0 16,6 8,6" } };
  const m = editor([CIRCULO, BARRA, tri]);
  assert.equal(m.combinarFormas("unir", motor).ok, true);
  assert.equal(m.elementos.length, 1);
  assert.ok(caixa(m).minY < 0.01, "o triângulo de cima entrou");
});

test("assíncrono: se as formas mudarem durante a conta, o resultado é descartado", () => {
  const m = editor([CIRCULO, BARRA]);
  const pedido = m.prepararCombinacao("unir");
  assert.ok(pedido && pedido.caminhos.length === 2);
  const d = motor("unir", pedido.caminhos);
  // Enquanto o worker calculava, a pessoa moveu uma forma
  m.selecionar(1);
  m.transformar("direita");
  assert.deepEqual(m.aplicarCombinacao(pedido, d), { ok: false, motivo: "selecao" });
  assert.equal(m.elementos.length, 2, "nada foi trocado");
  // Com as formas iguais, aplica
  m.selecionarTudo();
  const outro = m.prepararCombinacao("unir");
  assert.deepEqual(m.aplicarCombinacao(outro, motor("unir", outro.caminhos)), { ok: true });
});
