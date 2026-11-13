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
  tamanhoDoPng,
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
  assert.deepEqual(model.estiloDaSelecao(), { cor: "#ff0000", traco: 1, pontas: "butt", cantos: "miter" });
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
  // As três soltas ficaram seguidas: são um bloco só, e um degrau passa por elas
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

test("EditorModel: dica de unir e prévia das pontas que serão ligadas", async () => {
  const { pontasDaUniao } = await import("../public/js/models/svgGeometry.js");
  const a = { tag: "line", attrs: { x1: "2", y1: "2", x2: "10", y2: "2" } };
  const b = { tag: "line", attrs: { x1: "20", y1: "2", x2: "12", y2: "2" } };
  assert.deepEqual(pontasDaUniao(a, b), { de: { x: 10, y: 2 }, para: { x: 12, y: 2 } });
  assert.equal(pontasDaUniao(a, { tag: "circle", attrs: { cx: "1", cy: "1", r: "1" } }), null);

  const model = quatroFormas();
  model.selecionar(0);
  assert.equal(model.linhaAberta, true);
  assert.equal(model.ligacaoDaUniao, null);
  model.selecionar(2); // o círculo é fechado
  assert.equal(model.linhaAberta, false);
  model.definirSelecao([0, 1]);
  assert.equal(model.linhaAberta, false);
  assert.ok(model.ligacaoDaUniao);
  model.definirSelecao([0, 2]);
  assert.equal(model.ligacaoDaUniao, null);
});

test("unirTracos: aceita path de vários trechos, como os do Feather", async () => {
  const { unirTracos, podeUnir } = await import("../public/js/models/svgGeometry.js");
  const framer = { tag: "path", attrs: { d: "M5 16V9h14V2H5l14 14h-7m-7 0l7 7v-7m-7 0h7" } };
  assert.equal(podeUnir(framer, framer), true);
  const linha = { tag: "line", attrs: { x1: "22", y1: "16", x2: "13", y2: "16" } };
  // O fim do path fica em (12, 16), perto da linha: uma reta liga os dois
  assert.equal(unirTracos(framer, linha).attrs.d.endsWith("L12 16L22 16L13 16") || unirTracos(framer, linha).attrs.d.includes("L13 16"), true);
  // Invertido, os trechos continuam separados, sem riscos novos entre eles
  const longe = { tag: "line", attrs: { x1: "5", y1: "20", x2: "5", y2: "16.5" } };
  const d = unirTracos(longe, framer).attrs.d;
  assert.equal((d.match(/M/g) ?? []).length, 3);
});

test("EditorModel: em Ver camadas, um grupo é um bloco só", () => {
  const model = quatroFormas();
  assert.deepEqual(model.blocosDasCamadas(), [0, 1, 2, 3]);
  model.definirSelecao([1, 2]);
  model.agrupar("G");
  assert.deepEqual(model.blocosDasCamadas(), [0, 1, 1, 2]);
  model.desagrupar();
  assert.deepEqual(model.blocosDasCamadas(), [0, 1, 2, 3]);
});

test("uniaoInterna: fecha a linha ou liga a ponta a um ponto", async () => {
  const { uniaoInterna, aplicarUniaoInterna } = await import("../public/js/models/svgGeometry.js");
  const v = { tag: "polyline", attrs: { points: "2 2 12 12 22 2 30 2", stroke: "red" } };
  // Sem ponto, ou com uma ponta: fecha
  assert.equal(aplicarUniaoInterna(v).attrs.d, "M2 2L12 12L22 2L30 2Z");
  assert.equal(aplicarUniaoInterna(v, { x: 2, y: 2 }).attrs.d, "M2 2L12 12L22 2L30 2Z");
  assert.equal(aplicarUniaoInterna(v).attrs.points, undefined);
  assert.equal(aplicarUniaoInterna(v).attrs.stroke, "red");
  // Ponto mais perto do fim: a linha continua até ele
  assert.equal(aplicarUniaoInterna(v, { x: 22, y: 2 }).attrs.d, "M2 2L12 12L22 2L30 2L22 2");
  // Ponto mais perto do começo: o trecho passa a começar nele
  const u = aplicarUniaoInterna(v, { x: 12, y: 12 }, undefined);
  assert.equal(u.attrs.d, "M12 12L2 2L12 12L22 2L30 2");
  // Uma reta sozinha não fecha; uma curva sozinha fecha
  assert.equal(uniaoInterna({ tag: "line", attrs: { x1: "1", y1: "1", x2: "9", y2: "9" } }), null);
  assert.equal(aplicarUniaoInterna({ tag: "path", attrs: { d: "M2 12C2 2 22 2 22 12" } }).attrs.d, "M2 12C2 2 22 2 22 12Z");
  // Fechada não entra
  assert.equal(uniaoInterna({ tag: "path", attrs: { d: "M0 0L4 0L4 4Z" } }), null);
});

test("EditorModel: Unir com uma forma só fecha, ou liga ao ponto escolhido", () => {
  const model = new EditorModel();
  model.definirDocumento({
    raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor" },
    elementos: [{ tag: "polyline", attrs: { points: "2 2 12 12 22 2 22 20" } }],
  });
  model.selecionar(0);
  assert.equal(model.podeUnir, true);
  assert.equal(model.uniaoDaForma.fecha, true);
  model.selecionarPonto("p2");
  assert.equal(model.uniaoDaForma.fecha, false);
  assert.deepEqual(model.ligacaoDaUniao.para, { x: 22, y: 2 });
  model.unir();
  assert.equal(model.elementos[0].attrs.d, "M2 2L12 12L22 2L22 20L22 2");
  assert.equal(model.pontoSelecionado, null);
  assert.equal(model.selecionado, 0);
  model.desfazer();
  assert.equal(model.elementos[0].tag, "polyline");
  model.selecionar(0);
  model.unir();
  assert.equal(model.elementos[0].attrs.d, "M2 2L12 12L22 2L22 20Z");
  assert.equal(model.podeUnir, false); // já fechada
});

test("formaFechada: círculos, polígonos e paths fechados", async () => {
  const { formaFechada } = await import("../public/js/models/svgGeometry.js");
  assert.equal(formaFechada({ tag: "circle", attrs: { cx: "1", cy: "1", r: "1" } }), true);
  assert.equal(formaFechada({ tag: "polygon", attrs: { points: "0 0 4 0 4 4" } }), true);
  assert.equal(formaFechada(path("M0 0L4 0L4 4Z")), true);
  assert.equal(formaFechada(path("M0 0L4 0L4 4L0 0")), true); // volta ao início
  assert.equal(formaFechada(path("M0 0L4 0L4 4Z M8 8L9 9")), false); // um trecho aberto
  assert.equal(formaFechada(path("M0 0L4 0L4 4")), false);
  assert.equal(formaFechada({ tag: "line", attrs: { x1: "1", y1: "1", x2: "9", y2: "9" } }), false);
  assert.equal(formaFechada({ tag: "polyline", attrs: { points: "0 0 4 0 4 4" } }), false);
});

test("EditorModel: preencher uma forma fechada e tirar o preenchimento", () => {
  const model = quatroFormas();
  model.selecionar(0); // linha
  assert.equal(model.podePreencher, false);
  assert.equal(model.alternarPreenchimento(), false);
  model.selecionar(2); // círculo
  assert.equal(model.podePreencher, true);
  assert.equal(model.preenchida, false);
  model.alternarPreenchimento();
  assert.equal(model.elementos[2].attrs.fill, "currentColor");
  assert.equal(model.preenchida, true);
  assert.match(model.svg(), /<circle[^>]*fill="currentColor"/);
  model.alternarPreenchimento();
  assert.equal(model.elementos[2].attrs.fill, undefined);
  model.alternarPreenchimento();
  model.desfazer();
  assert.equal(model.preenchida, false);
  // Com cor própria, o preenchimento segue a cor
  model.definirCor("#ff0000");
  model.alternarPreenchimento();
  assert.equal(model.elementos[2].attrs.fill, "#ff0000");
  model.definirCor("#00ff00");
  assert.equal(model.elementos[2].attrs.fill, "#00ff00");
});

test("EditorModel: tirar o preenchimento de uma forma sem traço não a faz sumir", () => {
  const model = new EditorModel();
  model.definirDocumento({
    raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 16 16", fill: "currentColor" },
    elementos: [path("M0 0L4 0L4 4Z")],
  });
  model.selecionar(0);
  assert.equal(model.preenchida, true);
  model.alternarPreenchimento();
  assert.equal(model.elementos[0].attrs.fill, "none");
  assert.equal(model.elementos[0].attrs.stroke, "currentColor");
  model.alternarPreenchimento();
  assert.equal(model.preenchida, true);
});

// ── Bugs corrigidos ─────────────────────────────────────────────────────────
const reta = (x) => ({ tag: "line", attrs: { x1: String(x), y1: "2", x2: String(x), y2: "20" } });
const ordemDe = (model) => model.elementos.map((el) => el.attrs.x1 + (el.grupo ? `g${el.grupo}` : "")).join(" ");

test("EditorModel: mover um grupo um degrau não mexe na ordem das outras camadas", () => {
  const model = new EditorModel();
  model.definirDocumento({ raiz: { viewBox: "0 0 24 24" }, elementos: [reta(1), reta(2), reta(3), reta(4)] });
  model.grupos.push({ nome: "G", manual: true }, { nome: "H", manual: true });
  model.elementos[1].grupo = 1;
  model.elementos[3].grupo = 2;
  model.selecionarGrupo(2);
  model.ordenar("tras");
  assert.equal(ordemDe(model), "1 2g1 4g2 3");
  model.ordenar("tras");
  assert.equal(ordemDe(model), "1 4g2 2g1 3");
  model.ordenar("fundo");
  assert.equal(ordemDe(model), "4g2 1 2g1 3");
});

test("EditorModel: editar o código mantém as formas ocultas e os grupos", () => {
  const model = new EditorModel();
  model.definirDocumento({ raiz: { viewBox: "0 0 24 24" }, elementos: [reta(1), reta(2), reta(3)] });
  model.grupos.push({ nome: "G", manual: true });
  model.elementos[2].grupo = 1;
  model.alternarOculto(0);
  // O código mostra só as visíveis (2 e 3); a pessoa muda a 3 para 5
  model.aplicarDocumento({ raiz: { viewBox: "0 0 24 24" }, elementos: [reta(2), reta(5)] });
  assert.equal(ordemDe(model), "1 2 5g1");
  assert.equal(model.elementos[0].oculto, true);
  // Forma a mais no código entra no primeiro ícone; a menos, sai
  model.aplicarDocumento({ raiz: { viewBox: "0 0 24 24" }, elementos: [reta(2), reta(5), reta(7)] });
  assert.equal(ordemDe(model), "1 2 5g1 7");
  model.aplicarDocumento({ raiz: { viewBox: "0 0 24 24" }, elementos: [reta(2)] });
  assert.equal(ordemDe(model), "1 2");
  model.desfazer();
  assert.equal(ordemDe(model), "1 2 5g1 7");
});

test("EditorModel: desfazer, apagar e setas esperam o fim do arraste", () => {
  const model = new EditorModel();
  model.definirDocumento({ raiz: { viewBox: "0 0 24 24" }, elementos: [reta(1), reta(2)] });
  model.selecionar(0);
  model.transformar("direita"); // um passo no histórico antes do arraste
  model.iniciarArraste();
  model.arrastarElemento(3, 0);
  model.desfazer();
  model.remover();
  assert.equal(model.transformar("direita"), 0);
  assert.equal(model.elementos.length, 2);
  model.terminarArraste();
  assert.equal(model.elementos[0].attrs.x1, "4.5");
  // Desfazer agora volta o arraste, e depois a seta
  model.desfazer();
  assert.equal(model.elementos[0].attrs.x1, "1.5");
  model.desfazer();
  assert.equal(model.elementos[0].attrs.x1, "1");
});

test("tamanhoDoPng: largura em pixels, ou a do viewBox", () => {
  assert.equal(tamanhoDoPng({ width: "24", viewBox: "0 0 24 24" }), 24);
  assert.equal(tamanhoDoPng({ width: "32px" }), 32);
  assert.equal(tamanhoDoPng({ width: "1em", viewBox: "0 0 16 16" }), 16);
  assert.equal(tamanhoDoPng({ width: "100%", viewBox: "0 0 512 512" }), 512);
  assert.equal(tamanhoDoPng({}), 24);
});

test("corCss: só cores simples vão para o style da amostra", async () => {
  const { corCss } = await import("../public/js/views/html.js");
  for (const cor of ["#e11d48", "#fff", "red", "rgb(1, 2, 3)", "hsla(10deg 50% 50% / 0.5)"])
    assert.equal(corCss(cor), cor);
  for (const cor of ["red;background:url(https://x.test/a)", "url(#g)", "expression(alert(1))", "", null])
    assert.equal(corCss(cor), null);
});

// ── Lote A: duplicar, alinhar, caixa, pontas e cantos, otimizar ─────────────
const tres = () => {
  const model = new EditorModel();
  model.definirDocumento({
    raiz: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-linecap": "round" },
    elementos: [
      { tag: "line", attrs: { x1: "2", y1: "4", x2: "6", y2: "4" } },
      { tag: "line", attrs: { x1: "10", y1: "8", x2: "12", y2: "8" } },
      { tag: "line", attrs: { x1: "18", y1: "12", x2: "20", y2: "12" } },
    ],
  });
  return model;
};

test("EditorModel: duplicar deixa a cópia selecionada e não mexe no Ctrl+C", () => {
  const model = tres();
  model.selecionar(2);
  model.copiar();
  model.selecionar(0);
  assert.equal(model.duplicar(), true);
  assert.equal(model.elementos.length, 4);
  assert.deepEqual(model.alvos(), [3]);
  assert.equal(model.elementos[3].attrs.x1, "3"); // um passo ao lado (passo 0,5 × 2)
  // O que foi copiado antes continua no Ctrl+V
  model.colar();
  assert.equal(model.elementos[4].attrs.x1, "19");
  model.limparSelecao();
  assert.equal(model.duplicar(), false);
});

test("EditorModel: Shift+seta anda dez passos", () => {
  const model = tres();
  model.selecionar(0);
  model.transformar("direita", { vezes: 10 });
  assert.equal(model.elementos[0].attrs.x1, "7");
});

test("EditorModel: alinhar entre formas e com a área do ícone", () => {
  const model = tres();
  model.definirSelecao([0, 1, 2]);
  model.alinhar("esquerda");
  assert.deepEqual(model.elementos.map((el) => el.attrs.x1), ["2", "2", "2"]);
  model.desfazer();
  model.alinhar("distribuirH");
  // Larguras 4, 2 e 2 entre x=2 e x=20: vão de 5 entre elas
  assert.deepEqual(model.elementos.map((el) => el.attrs.x1), ["2", "11", "18"]);
  // Uma forma só: centraliza no ícone
  model.selecionar(1);
  model.alinhar("centroH");
  model.alinhar("centroV");
  assert.deepEqual([model.elementos[1].attrs.x1, model.elementos[1].attrs.y1], ["11", "12"]);
  assert.equal(model.alinhar("centroV"), false); // já está no centro
  // Distribuir precisa de três
  model.definirSelecao([0, 1]);
  assert.equal(model.alinhar("distribuirH"), false);
});

test("EditorModel: posição e tamanho exatos da seleção", () => {
  const model = tres();
  model.selecionar(0);
  assert.deepEqual(model.caixaDaSelecao(), { x: 2, y: 4, w: 4, h: 0 });
  model.definirCaixa({ x: 5 });
  assert.equal(model.elementos[0].attrs.x1, "5");
  model.definirCaixa({ w: 8 });
  assert.deepEqual([model.elementos[0].attrs.x1, model.elementos[0].attrs.x2], ["5", "13"]);
  // Altura zero (linha reta) não pode crescer na proporção
  assert.equal(model.definirCaixa({ h: 3 }), false);
});

test("EditorModel: pontas e cantos do traço, herdados quando iguais ao <svg>", () => {
  const model = tres();
  model.selecionar(0);
  assert.equal(model.estiloDaSelecao().pontas, "round");
  model.definirAtributoDoTraco("stroke-linecap", "square");
  assert.equal(model.elementos[0].attrs["stroke-linecap"], "square");
  model.definirAtributoDoTraco("stroke-linecap", "round");
  assert.equal(model.elementos[0].attrs["stroke-linecap"], undefined);
  assert.equal(model.definirAtributoDoTraco("stroke-linecap", "round"), false);
  assert.equal(model.definirAtributoDoTraco("fill", "red"), false);
});

test("EditorModel: otimizar tira o que não muda o desenho, com desfazer", () => {
  const model = new EditorModel();
  model.definirDocumento({
    raiz: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", version: "1.1", "data-x": "1" },
    elementos: [
      { tag: "path", attrs: { d: "M 2.000 2.000 L 10.000 10.000", stroke: "currentColor", class: "" } },
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "3", fill: "none" } },
    ],
  });
  const ganho = model.otimizar();
  assert.ok(ganho > 0);
  assert.equal(model.svg(), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 2L10 10"/><circle cx="12" cy="12" r="3"/></svg>');
  assert.equal(model.otimizar(), 0); // nada mais a tirar, sem passo novo
  model.desfazer();
  assert.ok(model.svg().includes('version="1.1"'));
});

// ── Lote B: encaixe com guias, alças, caneta, lista, Tab ────────────────────
test("EditorModel: arrastar um ponto gruda nos pontos de outra forma, com guia", () => {
  const model = tres();
  model.passo = 0;
  model.selecionar(1);
  model.iniciarArraste();
  // O ponto p1 da segunda linha (10, 8) vai para perto de (6.2, 4.1): gruda em (6, 4)
  model.arrastarPonto("p1", 6.2, 4.1, { tolerancia: 0.5 });
  assert.equal(model.elementos[1].attrs.x1, "6");
  assert.equal(model.elementos[1].attrs.y1, "4");
  assert.deepEqual(model.guias, [{ x: 6 }, { y: 4 }]);
  // Sem tolerância (Alt), só a grade
  model.arrastarPonto("p1", 6.2, 4.1);
  assert.equal(model.elementos[1].attrs.x1, "6.2");
  assert.deepEqual(model.guias, []);
  model.terminarArraste();
});

test("EditorModel: arrastar uma forma gruda a borda dela no centro do ícone", () => {
  const model = tres();
  model.passo = 0;
  model.selecionar(1); // x de 10 a 12: centro 11
  model.iniciarArraste();
  model.arrastarElemento(0.8, 0, { tolerancia: 0.5 }); // centro iria a 11.8 → gruda no 12
  assert.equal(model.elementos[1].attrs.x1, "11");
  assert.ok(model.guias.some((g) => g.x === 12));
  model.terminarArraste();
  assert.deepEqual(model.guias, []);
});

test("EditorModel: alças mudam o tamanho e giram, num passo só", () => {
  const model = tres();
  model.selecionar(0); // de (2, 4) a (6, 4)
  model.iniciarArraste();
  model.arrastarEscala(2, 2, 4);
  model.arrastarEscala(1.5, 2, 4); // cada movimento parte do início
  assert.equal(model.elementos[0].attrs.x2, "8");
  model.terminarArraste();
  model.iniciarArraste();
  model.arrastarGiro(90, 5, 4);
  model.terminarArraste();
  assert.deepEqual([model.elementos[0].attrs.x1, model.elementos[0].attrs.y1], ["5", "1"]);
  model.desfazer();
  model.desfazer();
  assert.equal(model.elementos[0].attrs.x2, "6");
});

test("caminhoDaCaneta: retas, curvas pelas alças e fechar", async () => {
  const { caminhoDaCaneta } = await import("../public/js/models/svgGeometry.js");
  assert.equal(caminhoDaCaneta([{ x: 2, y: 2 }]), null);
  assert.equal(caminhoDaCaneta([{ x: 2, y: 2 }, { x: 10, y: 2 }]), "M2 2L10 2");
  assert.equal(caminhoDaCaneta([{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 10 }], true), "M2 2L10 2L10 10Z");
  // Alça no segundo ponto: o trecho chega pelo lado espelhado e sai pela alça
  assert.equal(
    caminhoDaCaneta([{ x: 2, y: 12 }, { x: 12, y: 2, h: { x: 16, y: 2 } }, { x: 22, y: 12 }]),
    "M2 12C2 12 8 2 12 2C16 2 22 12 22 12",
  );
});

test("EditorModel: caneta, reordenar na lista, renomear grupo e Tab", () => {
  const model = tres();
  assert.equal(model.adicionarPath("M2 2L10 10"), true);
  assert.deepEqual(model.alvos(), [3]);
  assert.equal(model.adicionarPath("M2 2 Q"), false);
  // Lista: a forma 3 vai para o lugar da 0
  model.moverForma(3, 0);
  assert.equal(model.elementos[0].tag, "path");
  assert.deepEqual(model.alvos(), [0]);
  // Só dentro do mesmo grupo
  model.grupos.push({ nome: "G", manual: true });
  model.elementos[3].grupo = 1;
  assert.equal(model.moverForma(3, 1), false);
  // Renomear: só grupos, sem nome vazio
  assert.equal(model.renomearGrupo(1, "  Seta  "), true);
  assert.equal(model.grupos[1].nome, "Seta");
  assert.equal(model.renomearGrupo(1, "   "), false);
  assert.equal(model.renomearGrupo(0, "x"), false);
  // Tab: a seguinte; depois da última, null
  model.limparSelecao();
  assert.equal(model.selecionarVizinha(1), 0);
  assert.equal(model.selecionarVizinha(1), 1);
  model.selecionar(3);
  assert.equal(model.selecionarVizinha(1), null);
  model.limparSelecao();
  assert.equal(model.selecionarVizinha(-1), 3);
});

// ── Degradê ────────────────────────────────────────────────────────────────
import { DEGRADES_SUGERIDOS, ehDegrade, lerDegrade, montarDegrade } from "../public/js/models/degrade.js";

const LUCIDE_DEGRADE = {
  raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
  elementos: [
    { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
    { tag: "line", attrs: { x1: "4", y1: "12", x2: "20", y2: "12" } },
  ],
};

test("degradê: monta e lê de volta o mesmo pedido (linear e radial)", () => {
  const caixa = { minX: 2, minY: 2, maxX: 22, maxY: 22 };
  for (const angulo of [0, 45, 90, 180, 270]) {
    const html = montarDegrade("il-grad-1", { tipo: "linear", cores: ["#FF0000", "#0000ff"], angulo }, caixa);
    assert.deepEqual(lerDegrade(html), { tipo: "linear", cores: ["#ff0000", "#0000ff"], angulo });
  }
  // 90°: da esquerda para a direita, no meio da caixa
  assert.match(montarDegrade("il-grad-1", { cores: ["#000000", "#ffffff"], angulo: 90 }, caixa), /x1="2" y1="12" x2="22" y2="12"/);
  const radial = montarDegrade("il-grad-2", { tipo: "radial", cores: ["#000000", "#ffffff"] }, caixa);
  assert.match(radial, /^<radialGradient id="il-grad-2" gradientUnits="userSpaceOnUse" cx="12" cy="12"/);
  assert.equal(lerDegrade(radial).tipo, "radial");
  assert.throws(() => montarDegrade("il-grad-1", { cores: ["red", "#fff"] }, caixa));
  assert.throws(() => montarDegrade("x\" onload=\"", { cores: ["#000000", "#ffffff"] }, caixa));
  assert.ok(DEGRADES_SUGERIDOS.length >= 6 && DEGRADES_SUGERIDOS.every((d) => d.cores.every((c) => /^#[0-9a-f]{6}$/.test(c))));
});

test("degradê: no traço vale também para a linha reta; um elemento cobre a seleção", () => {
  const model = new EditorModel();
  model.definirDocumento(LUCIDE_DEGRADE, "icone");
  model.selecionarTudo();
  assert.equal(model.podeDegrade("fill"), true, "o círculo é fechado");
  assert.ok(model.aplicarDegrade({ tipo: "linear", cores: ["#ff7e5f", "#feb47b"], angulo: 90, alvo: "stroke" }));
  const svg = model.svg();
  assert.equal((svg.match(/<linearGradient /g) || []).length, 1);
  assert.match(svg, /<circle [^>]*stroke="url\(#il-grad-1\)"/);
  assert.match(svg, /<line [^>]*stroke="url\(#il-grad-1\)"/);
  // Usa coordenadas do ícone: a linha (altura zero) não some
  assert.match(svg, /gradientUnits="userSpaceOnUse"/);
  assert.deepEqual(model.degradeDaSelecao(), { tipo: "linear", cores: ["#ff7e5f", "#feb47b"], angulo: 90, alvo: "stroke" });
  // O seletor de cor mostra a primeira cor
  assert.equal(model.estiloDaSelecao().cor, "#ff7e5f");
});

test("degradê: o elemento do degradê não entra na seleção nem sobra sem uso", () => {
  const model = new EditorModel();
  model.definirDocumento(LUCIDE_DEGRADE, "icone");
  model.selecionarTudo();
  model.aplicarDegrade({ cores: ["#000000", "#ffffff"], alvo: "stroke" });
  assert.equal(model.elementos.filter(ehDegrade).length, 1);
  model.selecionarTudo();
  assert.equal(model.quantidade, 2, "só as duas formas");
  // Reaplicar troca o degradê sem acumular elementos
  for (let k = 0; k < 5; k++) model.aplicarDegrade({ cores: ["#11998e", "#38ef7d"], alvo: "stroke", angulo: k * 30 });
  assert.equal(model.elementos.filter(ehDegrade).length, 1);
  // Uma cor lisa no lugar: o degradê some do SVG
  model.definirCor("#123456");
  assert.doesNotMatch(model.svg(), /Gradient/);
  // Desfazer volta o degradê
  model.desfazer();
  assert.match(model.svg(), /<linearGradient /);
});

test("degradê: preenchimento só em formas fechadas; acompanha a forma movida; remover deixa a 1ª cor", () => {
  const model = new EditorModel();
  model.definirDocumento(LUCIDE_DEGRADE, "icone");
  model.selecionar(1);
  assert.equal(model.podeDegrade("fill"), false, "linha não se preenche");
  assert.equal(model.aplicarDegrade({ cores: ["#000000", "#ffffff"], alvo: "fill" }), false);
  model.selecionar(0);
  assert.ok(model.aplicarDegrade({ tipo: "radial", cores: ["#7f00ff", "#e100ff"], alvo: "fill" }));
  assert.match(model.svg(), /<circle [^>]*fill="url\(#il-grad-\d+\)"/);
  assert.match(model.svg(), /cx="12" cy="12"/);
  model.transformar("direita", { vezes: 4 });
  const cx = Number(/<radialGradient [^>]*cx="([\d.]+)"/.exec(model.svg())[1]);
  assert.notEqual(cx, 12, "o centro do degradê seguiu o círculo");
  assert.ok(model.removerDegrade());
  assert.match(model.svg(), /<circle [^>]*fill="#7f00ff"/);
  assert.doesNotMatch(model.svg(), /Gradient/);
});

test("importar ícone com degradê: ids repetidos ganham outro número, as referências acompanham", () => {
  const icone = (cor) => ({
    raiz: { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24" },
    elementos: [
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "6", fill: "url(#il-grad-1)" } },
      { tag: "path", attrs: { d: "M1 1L5 5", "clip-path": "url(#corte)" } },
      { tag: "linearGradient", html: `<linearGradient id="il-grad-1" gradientUnits="userSpaceOnUse" x1="6" y1="12" x2="18" y2="12"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#ffffff"/></linearGradient>` },
      { tag: "clipPath", html: '<clipPath id="corte"><rect width="9" height="9"/></clipPath>' },
    ],
  });
  const model = new EditorModel();
  model.definirDocumento(icone("#ff0000"), "primeiro");
  model.importarDocumento(icone("#0000ff"), "segundo");
  const svg = model.svg();
  // O primeiro fica como estava; o segundo vira il-grad-2 e corte-2
  assert.equal(svg.match(/id="il-grad-1"/g).length, 1);
  assert.match(svg, /<linearGradient id="il-grad-2"[^>]*><stop offset="0" stop-color="#0000ff"/);
  assert.equal(svg.match(/fill="url\(#il-grad-2\)"/g).length, 1);
  assert.match(svg, /<clipPath id="corte-2">/);
  assert.equal(svg.match(/clip-path="url\(#corte-2\)"/g).length, 1);
  // Sem repetição, nada muda
  const so = new EditorModel();
  so.definirDocumento({ raiz: { viewBox: "0 0 24 24" }, elementos: [{ tag: "line", attrs: { x1: "0", y1: "0", x2: "1", y2: "1" } }] });
  so.importarDocumento(icone("#ff0000"), "um");
  assert.match(so.svg(), /id="il-grad-1"/);
});

test("comIdsUnicos: cada cópia na página com ids e referências próprias", async () => {
  const { comIdsUnicos } = await import("../public/js/views/html.js");
  const svg =
    '<svg viewBox="0 0 24 24"><path d="M1 1" fill="url(#il-grad-1)" stroke="url(#fora)"/><use href="#il-grad-1"/><linearGradient id="il-grad-1"><stop offset="0"/></linearGradient></svg>';
  const a = comIdsUnicos(svg);
  const b = comIdsUnicos(svg);
  const id = (texto) => /id="([^"]+)"/.exec(texto)[1];
  assert.notEqual(id(a), id(b));
  assert.ok(id(a).endsWith("-il-grad-1"));
  assert.ok(a.includes(`fill="url(#${id(a)})"`) && a.includes(`href="#${id(a)}"`));
  // Uma referência a algo que não é deste SVG fica como está
  assert.ok(a.includes('stroke="url(#fora)"'));
  // Sem id, o texto volta igual
  const simples = '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>';
  assert.equal(comIdsUnicos(simples), simples);
});

test("formas novas: dentro da área do ícone e com os pontos certos", () => {
  const area = { x: 0, y: 0, w: 24, h: 24 };
  const vertices = { pentagon: 5, hexagon: 6, octagon: 8, diamond: 4, star: 10, arrow: 7 };
  for (const [tag, n] of Object.entries(vertices)) {
    const f = novaForma(tag, area);
    assert.equal(f.tag, "polygon", tag);
    const pontos = pontosDoElemento(f);
    assert.equal(pontos.length, n, tag);
    assert.ok(pontos.every((p) => p.x >= 0 && p.x <= 24 && p.y >= 0 && p.y <= 24), `${tag} dentro da área`);
  }
  for (const tag of ["halfCircle", "quarterCircle", "heart", "bubble"]) {
    const f = novaForma(tag, area);
    assert.equal(f.tag, "path", tag);
    assert.doesNotThrow(() => lerPath(f.attrs.d), tag);
    assert.match(f.attrs.d, /Z$/, `${tag} fechado`);
  }
  // Ícone 16×16: a forma acompanha a grade
  assert.deepEqual(novaForma("diamond", { x: 0, y: 0, w: 16, h: 16 }).attrs.points, "8 3.333 11.667 8 8 12.667 4.333 8");
});

test("ponto curvo: alças alinhadas, reto de volta, e a forma vira path com o mesmo estilo", async () => {
  const { curvarPonto, endireitarPonto, adicionarPontoCurvo } = await import("../public/js/models/svgGeometry.js");
  const linha = { tag: "polyline", attrs: { points: "2 12 12 4 22 12", stroke: "red" } };
  const curvo = curvarPonto(linha, "p1");
  assert.equal(curvo.elemento.tag, "path");
  assert.equal(curvo.elemento.attrs.stroke, "red");
  assert.equal(curvo.id, "1:e");
  // As duas alças do ponto (12, 4) ficam na mesma reta, uma de cada lado
  const [, chega, sai] = lerPath(curvo.elemento.attrs.d);
  assert.equal(chega.y2, 4);
  assert.equal(sai.y1, 4);
  assert.ok(chega.x2 < 12 && sai.x1 > 12);
  // Endireitar volta a ser reta (L), e de novo não faz nada
  const reto = endireitarPonto(curvo.elemento, curvo.id);
  assert.equal(reto.elemento.attrs.d, "M2 12L12 4L22 12");
  assert.equal(endireitarPonto(reto.elemento, reto.id), null);
  // Ponto do M de um polígono: o fechamento (Z) também curva
  const quadrado = curvarPonto({ tag: "polygon", attrs: { points: "4 4 20 4 20 20 4 20" } }, "p0");
  assert.match(quadrado.elemento.attrs.d, /^M4 4C.*C[^C]*4 4Z$/);
  // + Ponto curvo numa reta: ponto novo no meio, já com alças
  const novo = adicionarPontoCurvo({ tag: "line", attrs: { x1: "2", y1: "12", x2: "22", y2: "12" } }, "p1");
  assert.equal(novo.elemento.attrs.d, "M2 12C5.333 12 8.667 12 12 12C15.333 12 18.667 12 22 12");
  // Numa curva, a divisão mantém o desenho (sem recalcular as alças)
  const curva = adicionarPontoCurvo({ tag: "path", attrs: { d: "M2 12C5 2 19 2 22 12" } }, "0:e");
  assert.equal(curva.elemento.attrs.d, "M2 12C3.5 7 7.75 4.5 12 4.5C16.25 4.5 20.5 7 22 12");
  // Círculo não tem ponto de traço
  assert.equal(curvarPonto({ tag: "circle", attrs: { cx: "12", cy: "12", r: "4" } }, "r"), null);
});

test("bloquear: fora do clique, da seleção, das transformações e do apagar; vai no .ile", () => {
  const model = editor();
  model.alternarBloqueado(0);
  assert.equal(model.elementos[0].bloqueado, true);
  // Não seleciona, nem por área nem Ctrl+A
  model.selecionar(0);
  assert.equal(model.selecionado, null);
  model.selecionarTudo();
  assert.deepEqual(model.alvos(), [1]);
  model.limparSelecao();
  model.selecionarArea({ x1: 0, y1: 0, x2: 24, y2: 24 });
  assert.deepEqual(model.alvos(), [1]);
  // Sem seleção, "tudo" pula a bloqueada
  model.limparSelecao();
  const linha = { ...model.elementos[0].attrs };
  model.transformar("direita");
  assert.deepEqual(model.elementos[0].attrs, linha);
  // O × da lista não apaga
  model.remover(0);
  assert.equal(model.elementos.length, 2);
  // Vai no .ile só quando é true, e volta ao abrir
  const projeto = model.exportarProjeto({ nome: "x" });
  assert.equal(projeto.elementos[0].bloqueado, true);
  assert.equal("bloqueado" in projeto.elementos[1], false);
  assert.match(model.svg(), /<line /, "no SVG a forma bloqueada continua");
  model.alternarBloqueado(0);
  model.selecionar(0);
  assert.equal(model.selecionado, 0);
});
