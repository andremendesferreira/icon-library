// Editor: leitura e escrita de paths, pontos arrastáveis, transformações e
// desfazer/refazer.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  escreverPath,
  fmt,
  lerPath,
  matrizes,
  moverPonto,
  novaForma,
  pontosDoElemento,
  transformarElemento,
} from "../public/js/models/svgGeometry.js";
import {
  EditorModel,
  FORMATO_ILE,
  VERSAO_ILE,
  validarProjeto,
} from "../public/js/models/EditorModel.js";

const path = (d) => ({ tag: "path", attrs: { d } });

test("fmt: até 3 casas, sem -0", () => {
  assert.equal(fmt(1.23456), "1.235");
  assert.equal(fmt(-0.0001), "0");
  assert.equal(fmt(12), "12");
});

test("lerPath: relativos, H/V e repetição implícita viram absolutos", () => {
  const cmds = lerPath("m2 3 4 0h2v-1l1 1zM10 10");
  assert.deepEqual(cmds, [
    { t: "M", x: 2, y: 3 },
    { t: "L", x: 6, y: 3 },
    { t: "L", x: 8, y: 3 },
    { t: "L", x: 8, y: 2 },
    { t: "L", x: 9, y: 3 },
    { t: "Z" },
    { t: "M", x: 10, y: 10 },
  ]);
});

test("lerPath: S e T refletem o controle anterior", () => {
  const [, c, s] = lerPath("M0 0C1 2 3 2 4 0S7 -2 8 0");
  assert.deepEqual(s, { t: "C", x1: 5, y1: -2, x2: 7, y2: -2, x: 8, y: 0 });
  assert.equal(c.t, "C");
  const [, , t] = lerPath("M0 0Q2 4 4 0T8 0");
  assert.deepEqual(t, { t: "Q", x1: 6, y1: -4, x: 8, y: 0 });
});

test("lerPath: arco com flags coladas e números sem separador", () => {
  const [, a, l] = lerPath("M4 4a2 2 0 012 2l-.5.5");
  assert.deepEqual(a, { t: "A", rx: 2, ry: 2, rot: 0, large: 0, sweep: 1, x: 6, y: 6 });
  assert.deepEqual(l, { t: "L", x: 5.5, y: 6.5 });
});

test("lerPath: dado inválido vira erro legível", () => {
  assert.throws(() => lerPath("M1 1 L x"), /Invalid path data/);
  assert.throws(() => lerPath("M1 1 A1 1 0 2 1 3 3"), /Invalid arc flag/);
});

test("escreverPath: ida e volta mantém o desenho", () => {
  const d = "M12 2v4m4.2 1.8 2.9-2.9M18 12h4a10 10 0 0 1-10 10Z";
  const escrito = escreverPath(lerPath(d));
  assert.equal(
    escrito,
    "M12 2L12 6M16.2 7.8L19.1 4.9M18 12L22 12A10 10 0 0 1 12 22Z",
  );
  // Escrever de novo o que foi escrito não muda nada
  assert.equal(escreverPath(lerPath(escrito)), escrito);
});

test("pontos: curva tem controles ligados aos seus pontos", () => {
  const pontos = pontosDoElemento(path("M2 2C4 0 8 0 10 2"));
  assert.deepEqual(
    pontos.map((p) => [p.id, p.tipo]),
    [["0:e", "end"], ["1:1", "ctrl"], ["1:2", "ctrl"], ["1:e", "end"]],
  );
  assert.deepEqual(pontos[1].de, { x: 2, y: 2 });
  assert.deepEqual(pontos[2].de, { x: 10, y: 2 });
});

test("moverPonto: ponto da curva leva os controles presos a ele", () => {
  const el = path("M0 0C1 1 2 1 3 0C4 -1 5 -1 6 0");
  const movido = moverPonto(el, "1:e", 3, 2);
  const [, c1, c2] = lerPath(movido.attrs.d);
  assert.deepEqual([c1.x2, c1.y2, c1.x, c1.y], [2, 3, 3, 2]);
  assert.deepEqual([c2.x1, c2.y1], [4, 1]);
  // O original não muda
  assert.equal(el.attrs.d, "M0 0C1 1 2 1 3 0C4 -1 5 -1 6 0");
});

test("moverPonto: formas básicas", () => {
  const circulo = moverPonto({ tag: "circle", attrs: { cx: "12", cy: "12", r: "2" } }, "r", 12, 17);
  assert.equal(circulo.attrs.r, "5");
  const ret = moverPonto({ tag: "rect", attrs: { x: "4", y: "4", width: "8", height: "8" } }, "tl", 14, 2);
  assert.deepEqual(ret.attrs, { x: "12", y: "2", width: "2", height: "10" });
  const poli = moverPonto({ tag: "polyline", attrs: { points: "1 1 2 2 3 3" } }, "p1", 5, 6);
  assert.equal(poli.attrs.points, "1 1 5 6 3 3");
});

test("transformar: giro de 90° em volta do centro", () => {
  const linha = transformarElemento(
    { tag: "line", attrs: { x1: "12", y1: "2", x2: "12", y2: "6" } },
    matrizes.girar90(12, 12),
  );
  assert.deepEqual(linha.attrs, { x1: "22", y1: "12", x2: "18", y2: "12" });
  const ret = transformarElemento(
    { tag: "rect", attrs: { x: "2", y: "8", width: "20", height: "8", rx: "2", ry: "1" } },
    matrizes.girar90(12, 12),
  );
  assert.deepEqual(ret.attrs, { x: "8", y: "2", width: "8", height: "20", rx: "1", ry: "2" });
});

test("transformar: espelho inverte o sentido dos arcos", () => {
  const [, a] = lerPath(
    transformarElemento(path("M4 12A8 8 0 0 1 20 12"), matrizes.espelharH(12)).attrs.d,
  );
  assert.deepEqual([a.sweep, a.x, a.y], [0, 4, 12]);
});

test("transformar: escala muda raios junto", () => {
  const c = transformarElemento(
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "4" } },
    matrizes.escalar(2, 12, 12),
  );
  assert.deepEqual(c.attrs, { cx: "12", cy: "12", r: "8" });
});

test("novaForma: centrada na área do ícone", () => {
  assert.deepEqual(novaForma("circle", { x: 0, y: 0, w: 24, h: 24 }).attrs, { cx: "12", cy: "12", r: "4" });
  assert.deepEqual(novaForma("circle", { x: 0, y: 0, w: 16, h: 16 }).attrs, { cx: "8", cy: "8", r: "2.667" });
});

function editor() {
  const model = new EditorModel();
  model.definirDocumento({
    raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor" },
    elementos: [
      { tag: "line", attrs: { x1: "4", y1: "12", x2: "20", y2: "12" } },
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "3" } },
    ],
  });
  return model;
}

test("EditorModel: svg final, ocultos ficam de fora", () => {
  const model = editor();
  assert.equal(
    model.svg(),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="4" y1="12" x2="20" y2="12"/><circle cx="12" cy="12" r="3"/></svg>',
  );
  model.alternarOculto(1);
  assert.doesNotMatch(model.svg(), /circle/);
});

test("EditorModel: arraste encaixa na grade e vira um passo do histórico", () => {
  const model = editor();
  model.selecionar(0);
  assert.ok(model.iniciarArraste());
  model.arrastarPonto("p1", 2.3, 9.8);
  model.arrastarPonto("p1", 2.2, 10.1);
  model.terminarArraste();
  assert.deepEqual(
    [model.elementos[0].attrs.x1, model.elementos[0].attrs.y1],
    ["2", "10"],
  );
  assert.equal(model.historico.length, 1);
  model.desfazer();
  assert.equal(model.elementos[0].attrs.x1, "4");
  model.refazerUltimo();
  assert.equal(model.elementos[0].attrs.x1, "2");
});

test("EditorModel: clique sem arraste não suja o histórico", () => {
  const model = editor();
  model.selecionar(1);
  model.iniciarArraste();
  model.terminarArraste();
  assert.equal(model.historico.length, 0);
});

test("EditorModel: transformar sem seleção vale para o ícone inteiro", () => {
  const model = editor();
  model.transformar("girar");
  assert.deepEqual(model.elementos[0].attrs, { x1: "12", y1: "4", x2: "12", y2: "20" });
  assert.equal(model.elementos[1].attrs.cx, "12");
  model.desfazer();
  assert.equal(model.elementos[0].attrs.y1, "12");
});

// Ícone preenchido do Bootstrap (16×16), para sobrepor
const BOOTSTRAP = {
  raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 16 16", fill: "currentColor" },
  elementos: [{ tag: "circle", attrs: { cx: "8", cy: "8", r: "4" } }],
};

test("importar: ícone 16×16 ajustado à grade 24×24, com o estilo de origem", () => {
  const model = editor();
  model.raiz["stroke-width"] = "2";
  model.importarDocumento(BOOTSTRAP, "circle fill");
  const novo = model.elementos[2];
  // Escala 1,5: mesmo lugar relativo, raio proporcional
  assert.deepEqual(
    [novo.attrs.cx, novo.attrs.cy, novo.attrs.r],
    ["12", "12", "6"],
  );
  // Preenchido como no Bootstrap, sem o traço herdado do Lucide — e sem
  // atributos de traço que não fariam diferença
  assert.equal(novo.attrs.fill, "currentColor");
  assert.equal(novo.attrs.stroke, "none");
  assert.equal(novo.attrs["stroke-linecap"], undefined);
  assert.equal(novo.grupo, 1);
  // O ícone importado fica selecionado inteiro
  assert.equal(model.grupoSelecionado, 1);
  assert.deepEqual(model.gruposEmUso().map((g) => g.nome), ["icon", "circle fill"]);
  assert.ok(model.misturado);
});

test("importar: traço de ícone 24×24 num 16×16 fica proporcional", () => {
  const model = new EditorModel();
  model.definirDocumento(BOOTSTRAP, "base");
  model.importarDocumento(
    {
      raiz: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
      elementos: [{ tag: "line", attrs: { x1: "0", y1: "12", x2: "24", y2: "12" } }],
    },
    "minus",
  );
  const linha = model.elementos[1];
  assert.deepEqual(
    [linha.attrs.x1, linha.attrs.y1, linha.attrs.x2, linha.attrs["stroke-width"]],
    ["0", "8", "16", "1.333"],
  );
  assert.equal(linha.attrs.fill, "none");
  assert.equal(linha.attrs.stroke, "currentColor");
});

test("grupo: arrastar e girar movem o ícone inteiro, em volta do centro dele", () => {
  const model = editor();
  model.importarDocumento(BOOTSTRAP, "dot");
  model.transformar("diminuir");
  model.transformar("diminuir");
  // Clique numa forma do grupo selecionado mantém o grupo
  model.clicarForma(2);
  assert.equal(model.grupoSelecionado, 1);
  assert.ok(model.iniciarArraste());
  model.arrastarElemento(4, -4);
  model.terminarArraste();
  assert.deepEqual([model.elementos[2].attrs.cx, model.elementos[2].attrs.cy], ["16", "8"]);
  // As formas do primeiro ícone não mudaram
  assert.equal(model.elementos[0].attrs.x1, "4");
  // Clique fora do grupo seleciona só aquela forma
  model.clicarForma(0);
  assert.equal(model.grupoSelecionado, null);
  assert.equal(model.selecionado, 0);
});

test("grupo: apagar a seleção apaga o ícone inteiro", () => {
  const model = editor();
  model.importarDocumento(BOOTSTRAP, "dot");
  model.remover();
  assert.equal(model.elementos.length, 2);
  assert.ok(!model.misturado);
});

test("cor: só na seleção, traço vira stroke e preenchimento vira fill", () => {
  const model = editor();
  model.selecionar(0);
  model.definirCor("#ff0000");
  assert.equal(model.elementos[0].attrs.stroke, "#ff0000");
  assert.equal(model.elementos[0].attrs.fill, undefined, "linha sem fill não ganha fill");
  assert.equal(model.elementos[1].attrs.stroke, undefined, "a outra forma não muda");
  assert.deepEqual(model.estiloDaSelecao(), { cor: "#ff0000", traco: 1 });
  assert.ok(model.misturado);
  // Voltar à cor do texto remove o atributo (a raiz já é currentColor)
  model.definirCor(null);
  assert.equal(model.elementos[0].attrs.stroke, undefined);
  assert.ok(!model.misturado);
});

test("cor: um passo no histórico por interação", () => {
  const model = editor();
  model.selecionar(1);
  model.definirCor("#111111", { registrar: true });
  model.definirCor("#222222", { registrar: false });
  model.definirCor("#333333", { registrar: false });
  assert.equal(model.historico.length, 1);
  model.desfazer();
  assert.equal(model.elementos[1].attrs.stroke, undefined);
});

test("espessura: por forma, e só onde há traço", () => {
  const model = editor();
  model.raiz["stroke-width"] = "2";
  model.selecionar(1);
  model.definirTraco(1.5);
  assert.equal(model.elementos[1].attrs["stroke-width"], "1.5");
  model.definirTraco(2);
  assert.equal(model.elementos[1].attrs["stroke-width"], undefined, "igual à raiz: herda");

  const preenchido = new EditorModel();
  preenchido.definirDocumento(BOOTSTRAP, "dot");
  preenchido.selecionar(0);
  preenchido.definirTraco(3);
  assert.equal(preenchido.elementos[0].attrs["stroke-width"], undefined);
  assert.equal(preenchido.estiloDaSelecao().traco, null);
});

test(".ile: o projeto salvo guarda grupos, ocultos e nome", () => {
  const model = editor();
  model.importarDocumento(BOOTSTRAP, "dot");
  model.alternarOculto(1);
  const projeto = JSON.parse(JSON.stringify(model.exportarProjeto({ nome: "heart", editavel: true })));
  assert.equal(projeto.formato, FORMATO_ILE);
  assert.equal(projeto.versao, VERSAO_ILE);
  assert.ok(!Number.isNaN(Date.parse(projeto.salvo)));
  assert.deepEqual(projeto.grupos.map((g) => g.nome), ["icon", "dot"]);
  assert.deepEqual(projeto.elementos.map((el) => [el.tag, el.grupo, el.oculto]), [
    ["line", 0, false],
    ["circle", 0, true],
    ["circle", 1, false],
  ]);
  // O que foi salvo passa na validação, como está
  const lido = validarProjeto(projeto);
  assert.equal(lido.nome, "heart");
  assert.equal(lido.editavel, true);
  assert.deepEqual(lido.elementos[1], { tag: "circle", grupo: 0, oculto: true, attrs: { cx: "12", cy: "12", r: "3" } });
});

test(".ile: arquivos inválidos têm mensagem clara", () => {
  const valido = editor().exportarProjeto({ nome: "x" });
  const com = (mudancas) => ({ ...structuredClone(valido), ...mudancas });
  assert.throws(() => validarProjeto({ a: 1 }), /not saved by Icon Library/);
  assert.throws(() => validarProjeto(com({ versao: VERSAO_ILE + 1 })), /newer version/);
  assert.throws(() => validarProjeto(com({ raiz: { "bad name": "1" } })), /bad <svg> attributes/);
  assert.throws(
    () => validarProjeto(com({ elementos: [{ tag: "circle", attrs: { r: 3 }, grupo: 0 }] })),
    /shape 1 has bad attributes/,
  );
  assert.throws(
    () => validarProjeto(com({ elementos: [{ tag: "circle", attrs: {}, grupo: 5 }] })),
    /shape 1 belongs to no icon/,
  );
  // Elemento fora das formas conhecidas só entra como html (que o editor
  // ainda limpa ao abrir)
  assert.throws(
    () => validarProjeto(com({ elementos: [{ tag: "script", attrs: {}, grupo: 0 }] })),
    /bad attributes/,
  );
  // Campos desconhecidos são ignorados
  assert.equal(validarProjeto(com({ extra: "?" })).extra, undefined);
});

test("EditorModel: adicionar e remover", () => {
  const model = editor();
  model.adicionar("rect");
  assert.equal(model.elementos.length, 3);
  assert.equal(model.selecionado, 2);
  model.remover();
  assert.equal(model.elementos.length, 2);
  assert.equal(model.selecionado, null);
});
