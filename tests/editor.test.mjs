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
import { adicionarPonto, dividirTrecho, removerPonto } from "../public/js/models/svgGeometry.js";
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

test("transformar: giro qualquer — 90° bate com girar90, 45° gira a linha", () => {
  assert.deepEqual(matrizes.girar(90, 12, 12), matrizes.girar90(12, 12));
  const linha = transformarElemento(
    { tag: "line", attrs: { x1: "12", y1: "12", x2: "22", y2: "12" } },
    matrizes.girar(45, 12, 12),
  );
  assert.deepEqual(linha.attrs, { x1: "12", y1: "12", x2: "19.071", y2: "19.071" });
});

test("transformar: 45° faz rect e ellipse virarem path com o mesmo desenho", () => {
  const ret = transformarElemento(
    { tag: "rect", attrs: { x: "2", y: "2", width: "20", height: "20", rx: "2", fill: "red" } },
    matrizes.girar(45, 12, 12),
  );
  assert.equal(ret.tag, "path");
  assert.equal(ret.attrs.fill, "red");
  assert.equal(ret.attrs.x, undefined);
  const cmds = lerPath(ret.attrs.d);
  // 4 lados + 4 cantos arredondados; o primeiro ponto (4, 2) girado em (12, 12)
  assert.equal(cmds.filter((c) => c.t === "A").length, 4);
  // (dx, dy) = (-8, -10) → ((dx - dy)/√2, (dx + dy)/√2) = (1.414, -12.728)
  assert.deepEqual([fmt(cmds[0].x), fmt(cmds[0].y)], ["13.414", "-0.728"]);
  const eli = transformarElemento(
    { tag: "ellipse", attrs: { cx: "12", cy: "12", rx: "6", ry: "3" } },
    matrizes.girar(45, 12, 12),
  );
  assert.equal(eli.tag, "path");
  const arcos = lerPath(eli.attrs.d).filter((c) => c.t === "A");
  assert.deepEqual(arcos.map((a) => [a.rx, a.ry, a.rot]), [[6, 3, 45], [6, 3, 45]]);
  // Giro de 90° continua mantendo o rect como rect
  assert.equal(transformarElemento({ tag: "rect", attrs: { x: "0", y: "0", width: "4", height: "2" } }, matrizes.girar(90, 12, 12)).tag, "rect");
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

test("EditorModel: copiar e colar uma forma, deslocada a cada colagem", () => {
  const model = editor();
  assert.equal(model.copiar(), false); // sem seleção, nada a copiar
  assert.equal(model.colar(), false);
  model.selecionar(1);
  assert.equal(model.copiar(), true);
  model.colar();
  model.colar();
  assert.equal(model.elementos.length, 4);
  assert.deepEqual([model.elementos[2].attrs.cx, model.elementos[3].attrs.cx], ["13", "14"]);
  assert.equal(model.selecionado, 3);
  // A cópia é independente: mexer na colada não muda a original
  model.transformar("direita");
  assert.equal(model.elementos[1].attrs.cx, "12");
  model.desfazer();
  model.desfazer();
  assert.equal(model.elementos.length, 3);
});

test("EditorModel: colar um ícone inteiro cria um ícone novo", () => {
  const model = editor();
  model.selecionarGrupo(0);
  model.copiar();
  model.colar();
  assert.equal(model.elementos.length, 4);
  assert.equal(model.grupos.length, 2);
  assert.equal(model.grupoSelecionado, 1);
  assert.deepEqual(model.indicesDoGrupo(1), [2, 3]);
});

test("EditorModel: girar 45° a forma selecionada", () => {
  const model = editor();
  model.selecionar(0);
  model.transformar("girar45");
  assert.deepEqual(model.elementos[0].attrs, { x1: "6.343", y1: "6.343", x2: "17.657", y2: "17.657" });
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

// ── Apagar e acrescentar pontos ─────────────────────────────────────────────
// Ponto de uma cúbica em t, para comparar o desenho antes e depois de dividir
const naCubica = (p0, c, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
    y: u * u * u * p0.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
  };
};

test("pontos: dividir uma curva ao meio não muda o desenho", () => {
  const de = { x: 2, y: 20 };
  const c = { t: "C", x1: 2, y1: 2, x2: 22, y2: 2, x: 22, y: 20 };
  const [a, b] = dividirTrecho(de, c);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const antes = naCubica(de, c, t);
    const depois = t <= 0.5 ? naCubica(de, a, t * 2) : naCubica({ x: a.x, y: a.y }, b, (t - 0.5) * 2);
    assert.ok(Math.hypot(antes.x - depois.x, antes.y - depois.y) < 1e-9, `t=${t}`);
  }
  // Quadrática e reta: o ponto novo fica no meio
  const [q] = dividirTrecho({ x: 0, y: 0 }, { t: "Q", x1: 10, y1: 10, x: 20, y: 0 });
  assert.deepEqual([q.x, q.y], [10, 5]);
  const [l] = dividirTrecho({ x: 0, y: 0 }, { t: "L", x: 10, y: 4 });
  assert.deepEqual([l.x, l.y], [5, 2]);
});

test("pontos: dividir um arco põe o ponto novo sobre o arco", () => {
  // Meia volta de raio 8 em (12, 12), passando por cima
  const [a, b] = dividirTrecho({ x: 4, y: 12 }, { t: "A", rx: 8, ry: 8, rot: 0, large: 0, sweep: 1, x: 20, y: 12 });
  assert.deepEqual([fmt(a.x), fmt(a.y)], ["12", "4"]);
  assert.deepEqual([a.large, b.large, a.sweep, b.sweep], [0, 0, 1, 1]);
  assert.deepEqual([b.x, b.y], [20, 12]);
});

test("pontos: acrescentar em linha, polilinha, polígono e path", () => {
  // Linha reta vira linha com 3 pontos
  const linha = adicionarPonto({ tag: "line", attrs: { x1: "2", y1: "2", x2: "10", y2: "6", stroke: "red" } }, "p1");
  assert.deepEqual(linha.elemento, { tag: "polyline", attrs: { points: "2 2 6 4 10 6", stroke: "red" } });
  assert.equal(linha.id, "p1");
  // Último ponto de uma linha aberta: divide o trecho que chega
  const fim = adicionarPonto({ tag: "polyline", attrs: { points: "0 0 10 0" } }, "p1");
  assert.equal(fim.elemento.attrs.points, "0 0 5 0 10 0");
  assert.equal(fim.id, "p1");
  // Polígono: o último ponto liga no primeiro
  assert.equal(adicionarPonto({ tag: "polygon", attrs: { points: "0 0 10 0 10 10" } }, "p2").elemento.attrs.points, "0 0 10 0 10 10 5 5");
  // Path: trecho seguinte, trecho de fechamento (Z) e o último ponto aberto
  assert.equal(adicionarPonto(path("M0 0L10 0L10 10"), "0:e").elemento.attrs.d, "M0 0L5 0L10 0L10 10");
  assert.equal(adicionarPonto(path("M0 0L10 0L10 10Z"), "2:e").elemento.attrs.d, "M0 0L10 0L10 10L5 5Z");
  assert.equal(adicionarPonto(path("M0 0L10 0"), "1:e").elemento.attrs.d, "M0 0L5 0L10 0");
  // Formas sem pontos de traço, alças de curva e ids desconhecidos: não
  assert.equal(adicionarPonto({ tag: "circle", attrs: { cx: "12", cy: "12", r: "4" } }, "c"), null);
  assert.equal(adicionarPonto(path("M0 0C5 5 5 5 10 0"), "1:1"), null);
  assert.equal(adicionarPonto(path("M0 0L10 0"), "9:e"), null);
});

test("pontos: apagar respeita o mínimo de cada forma", () => {
  assert.equal(removerPonto({ tag: "polyline", attrs: { points: "0 0 5 5 10 0" } }, "p1").attrs.points, "0 0 10 0");
  assert.equal(removerPonto({ tag: "polyline", attrs: { points: "0 0 10 0" } }, "p0"), null);
  assert.equal(removerPonto({ tag: "polygon", attrs: { points: "0 0 10 0 10 10" } }, "p0"), null);
  assert.equal(removerPonto({ tag: "line", attrs: { x1: "0", y1: "0", x2: "1", y2: "1" } }, "p1"), null);
  // Path: o primeiro ponto passa o "M" adiante; ponto do meio some
  assert.equal(removerPonto(path("M0 0L10 0L10 10"), "0:e").attrs.d, "M10 0L10 10");
  assert.equal(removerPonto(path("M0 0L10 0L10 10"), "1:e").attrs.d, "M0 0L10 10");
  // Nunca deixa o path sem nenhum trecho
  assert.equal(removerPonto(path("M0 0L10 0"), "1:e"), null);
  // Com dois subcaminhos, um que fica vazio sai inteiro
  assert.equal(removerPonto(path("M0 0L10 0M20 20L30 30Z"), "3:e").attrs.d, "M0 0L10 0");
});

test("EditorModel: selecionar ponto, apagar e acrescentar, com desfazer", () => {
  const model = new EditorModel();
  model.definirDocumento({
    raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor" },
    elementos: [{ tag: "path", attrs: { d: "M2 12L12 2L22 12" } }],
  });
  model.selecionar(0);
  model.selecionarPonto("1:e");
  assert.equal(model.pontoSelecionado, "1:e");
  assert.ok(model.podeRemoverPonto && model.podeAdicionarPonto);
  // Acrescentar: o ponto novo fica selecionado
  model.adicionarPontoNoSelecionado();
  assert.equal(model.elementos[0].attrs.d, "M2 12L12 2L17 7L22 12");
  assert.equal(model.pontoSelecionado, "2:e");
  model.removerPontoSelecionado();
  assert.equal(model.elementos[0].attrs.d, "M2 12L12 2L22 12");
  assert.equal(model.pontoSelecionado, null);
  model.desfazer();
  model.desfazer();
  assert.equal(model.elementos[0].attrs.d, "M2 12L12 2L22 12");
  // Ponto que não existe, ou trocar de forma, limpa a seleção do ponto
  model.selecionarPonto("9:e");
  assert.equal(model.pontoSelecionado, null);
  model.selecionarPonto("0:e");
  model.limparSelecao();
  assert.equal(model.pontoSelecionado, null);
});

test("EditorModel: mudar a ordem de uma forma", () => {
  const model = editor();
  model.adicionar("rect");
  const tags = () => model.elementos.map((el) => el.tag).join(",");
  assert.equal(model.ordenar("frente"), false); // já está por cima
  model.ordenar("tras");
  assert.equal(tags(), "line,rect,circle");
  assert.equal(model.selecionado, 1);
  model.ordenar("fundo");
  assert.equal(tags(), "rect,line,circle");
  assert.equal(model.selecionado, 0);
  assert.equal(model.ordenar("tras"), false);
  model.ordenar("topo");
  assert.equal(tags(), "line,circle,rect");
  model.desfazer();
  assert.equal(tags(), "rect,line,circle");
  model.limparSelecao();
  assert.equal(model.ordenar("frente"), false); // sem seleção, nada muda
});

test("EditorModel: mudar a ordem de um ícone inteiro", () => {
  const model = editor();
  model.selecionarGrupo(0);
  model.copiar();
  model.colar(); // ícone 1 por cima do 0
  model.selecionar(0);
  model.adicionar("rect"); // forma nova no ícone 0, depois do ícone 1
  model.selecionarGrupo(1);
  model.ordenar("fundo");
  assert.deepEqual(model.elementos.map((el) => el.grupo), [1, 1, 0, 0, 0]);
  assert.deepEqual(model.gruposEmUso().map((g) => g.grupo), [1, 0]);
  assert.equal(model.grupoSelecionado, 1);
  model.ordenar("frente");
  assert.deepEqual(model.elementos.map((el) => el.grupo), [0, 0, 0, 1, 1]);
});

test("unirTracos: junta pelas pontas mais próximas, invertendo se preciso", async () => {
  const { unirTracos, podeUnir } = await import("../public/js/models/svgGeometry.js");
  const a = { tag: "line", attrs: { x1: "2", y1: "2", x2: "10", y2: "2", stroke: "red" } };
  // b começa longe e termina encostado no fim de a: é percorrida ao contrário
  const b = { tag: "path", attrs: { d: "M10 12C14 12 10 2 10 2" } };
  assert.equal(unirTracos(a, b).attrs.d, "M2 2L10 2C10 2 14 12 10 12");
  assert.equal(unirTracos(a, b).attrs.stroke, "red");
  assert.equal(unirTracos(a, b).attrs.x1, undefined);
  // Pontas separadas: uma reta liga as duas
  const c = { tag: "polyline", attrs: { points: "12 4 20 4 20 10" } };
  assert.equal(unirTracos(a, c).attrs.d, "M2 2L10 2L12 4L20 4L20 10");
  // Arco invertido troca o sentido
  const arco = { tag: "path", attrs: { d: "M10 2A4 4 0 0 1 18 2" } };
  assert.equal(unirTracos({ tag: "line", attrs: { x1: "22", y1: "2", x2: "18", y2: "2" } }, arco).attrs.d, "M22 2L18 2A4 4 0 0 0 10 2");
  // Formas fechadas não se unem
  assert.equal(podeUnir(a, { tag: "circle", attrs: { cx: "1", cy: "1", r: "1" } }), false);
  assert.equal(podeUnir(a, { tag: "path", attrs: { d: "M0 0L4 0L4 4Z" } }), false);
});

test("EditorModel: Shift+clique marca duas linhas e unir vira um path só", () => {
  const model = editor();
  model.adicionar("line");
  model.selecionar(0);
  model.adicionarASelecao(2);
  assert.deepEqual(model.alvos(), [0, 2]);
  assert.deepEqual(model.pontosSelecionados(), []);
  assert.equal(model.podeUnir, true);
  assert.equal(model.unir(), true);
  assert.equal(model.elementos.length, 2);
  assert.equal(model.elementos[0].tag, "path");
  assert.equal(model.selecionado, 0);
  assert.deepEqual(model.extras, []);
  model.desfazer();
  assert.equal(model.elementos.length, 3);
  // Com o círculo não dá
  model.selecionar(0);
  model.adicionarASelecao(1);
  assert.equal(model.podeUnir, false);
  assert.equal(model.unir(), false);
  // Shift+clique de novo desmarca; clique comum volta a uma forma só
  model.adicionarASelecao(1);
  assert.deepEqual(model.extras, []);
  model.adicionarASelecao(2);
  model.clicarForma(2);
  assert.deepEqual(model.alvos(), [0, 2]);
  model.clicarForma(1);
  assert.deepEqual(model.alvos(), [1]);
});

test("separarForma: corta linhas e curvas em duas, abre formas fechadas", async () => {
  const { separarForma } = await import("../public/js/models/svgGeometry.js");
  const ds = (r) => r?.elementos.map((el) => el.attrs.d);
  const linha = { tag: "line", attrs: { x1: "2", y1: "12", x2: "22", y2: "12", stroke: "red" } };
  const corte = separarForma(linha, 8.3, 12.4, 1);
  assert.deepEqual(ds(corte), ["M2 12L8.3 12", "M8.3 12L22 12"]);
  assert.equal(corte.elementos[1].attrs.stroke, "red");
  assert.equal(corte.elementos[1].attrs.x1, undefined);
  // Longe do traço, ou numa ponta: não corta
  assert.equal(separarForma(linha, 8, 16, 1), null);
  assert.equal(separarForma(linha, 2, 12, 1), null);
  // Curva: De Casteljau no ponto clicado
  assert.deepEqual(ds(separarForma({ tag: "path", attrs: { d: "M2 12C2 2 22 2 22 12" } }, 12, 4.5, 1)), [
    "M2 12C2 7 7 4.5 12 4.5",
    "M12 4.5C17 4.5 22 7 22 12",
  ]);
  // Perto de um vértice, corta nele
  assert.deepEqual(ds(separarForma({ tag: "polyline", attrs: { points: "2 2 12 12 22 2" } }, 12.0002, 12, 1)), [
    "M2 2L12 12",
    "M12 12L22 2",
  ]);
  // Fechadas: uma forma só, aberta no corte, começando e terminando nele
  assert.deepEqual(ds(separarForma({ tag: "polygon", attrs: { points: "2 2 22 2 12 20" } }, 12, 2, 1)), [
    "M12 2L22 2L12 20L2 2L12 2",
  ]);
  const circulo = ds(separarForma({ tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } }, 12, 2.2, 1))[0];
  assert.match(circulo, /^M12 2A10 10 0 0 0 2 12A10 10 0 1 0 22 12A10 10 0 0 0 12 2$/);
});

test("EditorModel: separar a forma selecionada", () => {
  const model = editor();
  model.selecionar(0); // a linha de 4 12 a 20 12
  assert.equal(model.podeSeparar, true);
  assert.equal(model.separar(12, 30), false); // longe do traço
  assert.equal(model.separar(10, 12.5), true);
  assert.deepEqual(model.elementos.map((el) => el.attrs.d ?? el.tag), ["M4 12L10 12", "M10 12L20 12", "circle"]);
  assert.deepEqual(model.alvos(), [0, 1]); // os dois pedaços ficam marcados
  assert.equal(model.podeSeparar, false);
  model.desfazer();
  assert.equal(model.elementos[0].tag, "line");
  // Círculo: abre e continua um elemento só
  model.selecionar(1);
  assert.equal(model.separar(15, 12), true);
  assert.equal(model.elementos.length, 2);
  assert.equal(model.elementos[1].tag, "path");
});

test("novaForma: triângulo é um polígono de três pontos no centro", () => {
  const el = novaForma("triangle", { x: 0, y: 0, w: 24, h: 24 });
  assert.deepEqual(el, { tag: "polygon", attrs: { points: "12 7 18 16 6 16" } });
});

function quatroFormas() {
  const model = new EditorModel();
  model.definirDocumento({
    raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
    elementos: [
      { tag: "line", attrs: { x1: "2", y1: "2", x2: "10", y2: "2" } },
      { tag: "line", attrs: { x1: "2", y1: "6", x2: "10", y2: "6" } },
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "6" } },
      { tag: "line", attrs: { x1: "14", y1: "20", x2: "20", y2: "20" } },
    ],
  });
  return model;
}

test("EditorModel: seleção por área olha a linha, não a caixa em volta", () => {
  const model = quatroFormas();
  // Dentro do círculo, sem encostar no traço dele
  model.selecionarArea({ x1: 9, y1: 9, x2: 15, y2: 15 });
  assert.equal(model.temSelecao, false);
  model.selecionarArea({ x1: 3, y1: 1, x2: 5, y2: 7 });
  assert.deepEqual(model.alvos(), [0, 1]);
  // Substitui, ou soma com Shift
  model.selecionarArea({ x1: 15, y1: 19, x2: 16, y2: 21 });
  assert.deepEqual(model.alvos(), [3]);
  model.selecionarArea({ x1: 3, y1: 1.5, x2: 4, y2: 2.5 }, { somar: true });
  assert.deepEqual(model.alvos(), [3, 0]);
  // A espessura conta: 0,5 acima da linha ainda encosta no traço de largura 2
  model.selecionarArea({ x1: 15, y1: 20.5, x2: 16, y2: 20.9 });
  assert.deepEqual(model.alvos(), [3]);
  // Oculta não entra
  model.alternarOculto(3);
  model.selecionarArea({ x1: 15, y1: 19, x2: 16, y2: 21 });
  assert.equal(model.temSelecao, false);
});

test("EditorModel: várias formas valem juntas para mover, ordenar e apagar", () => {
  const model = quatroFormas();
  model.definirSelecao([0, 1]);
  assert.equal(model.quantidade, 2);
  assert.deepEqual(model.pontosSelecionados(), []);
  model.transformar("direita");
  assert.equal(model.elementos[0].attrs.x1, "2.5");
  assert.equal(model.elementos[1].attrs.x1, "2.5");
  // Ordem: o conjunto vai junto e mantém a ordem interna
  model.ordenar("topo");
  assert.deepEqual(model.elementos.map((el) => el.attrs.y1 ?? "c"), ["c", "20", "2", "6"]);
  assert.deepEqual(model.alvos(), [2, 3]);
  assert.equal(model.ordenar("frente"), false);
  model.ordenar("tras");
  assert.deepEqual(model.elementos.map((el) => el.attrs.y1 ?? "c"), ["c", "2", "6", "20"]);
  model.selecionarTudo();
  assert.equal(model.quantidade, 4);
  model.remover();
  assert.equal(model.elementos.length, 0);
  model.desfazer();
  assert.equal(model.elementos.length, 4);
});

test("EditorModel: agrupar, clicar, entrar com duplo clique e desagrupar", () => {
  const model = quatroFormas();
  assert.equal(model.podeAgrupar, false);
  model.definirSelecao([0, 2]);
  assert.equal(model.agrupar("Grupo 1"), true);
  // O bloco fica na altura da forma mais acima
  assert.deepEqual(model.elementos.map((el) => el.grupo), [0, 1, 1, 0]);
  assert.deepEqual(model.elementos.map((el) => el.attrs.y1 ?? "c"), ["6", "2", "c", "20"]);
  assert.equal(model.grupoSelecionado, 1);
  assert.equal(model.podeAgrupar, false);
  assert.equal(model.podeDesagrupar, true);
  // Agrupar à mão não tira o ícone do Lucide Studio
  assert.equal(model.misturado, false);

  model.selecionar(0);
  model.clicarForma(2); // clique numa forma do grupo: o grupo inteiro
  assert.equal(model.grupoSelecionado, 1);
  model.selecionar(1); // duplo clique: uma forma lá dentro
  model.clicarForma(2); // novo clique troca de forma ali dentro
  assert.equal(model.selecionado, 2);
  assert.equal(model.podeDesagrupar, true);

  model.selecionarGrupo(1);
  model.selecionarArea({ x1: 3, y1: 5, x2: 4, y2: 7 }); // toca só na forma solta
  assert.deepEqual(model.alvos(), [0]);
  model.selecionarArea({ x1: 3, y1: 1, x2: 4, y2: 3 }); // toca numa do grupo: pega o grupo
  assert.equal(model.grupoSelecionado, 1);

  // Salvo no .ile, o grupo continua sendo um grupo manual
  const salvo = JSON.stringify(model.exportarProjeto({ nome: "x" }));

  assert.deepEqual(validarProjeto(JSON.parse(salvo)).grupos[1], { nome: "Grupo 1", manual: true });

  assert.equal(model.desagrupar(), true);
  assert.deepEqual(model.elementos.map((el) => el.grupo), [0, 0, 0, 0]);
  assert.deepEqual(model.alvos(), [1, 2]);
  model.desfazer();
  assert.deepEqual(model.elementos.map((el) => el.grupo), [0, 1, 1, 0]);
});

test("EditorModel: copiar várias formas e copiar um grupo", () => {
  const model = quatroFormas();
  model.definirSelecao([0, 1]);
  model.copiar();
  model.colar();
  assert.equal(model.elementos.length, 6);
  assert.deepEqual(model.alvos(), [4, 5]);
  model.agrupar("G");
  model.copiar();
  model.colar();
  assert.equal(model.elementos.length, 8);
  assert.deepEqual(model.grupos[model.grupoSelecionado], { nome: "G", manual: true });
  assert.notEqual(model.grupoSelecionado, 1);
});
