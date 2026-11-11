import {
  FORMAS,
  caminhoDaForma,
  escreverPath,
  adicionarPonto,
  aplicarUniaoInterna,
  formaTocaRetangulo,
  fmt,
  formaFechada,
  lerPath,
  limitesDoElemento,
  matrizes,
  moverPonto,
  novaForma,
  pontasDaUniao,
  pontosDoElemento,
  podeUnir,
  removerPonto,
  separarForma,
  transformarElemento,
  uniaoInterna,
  unirTracos,
} from "./svgGeometry.js";
import { erro as erroCom } from "./erros.js";
import { ehDegrade, idDoDegrade, lerDegrade, montarDegrade, normalizarDegrade } from "./degrade.js";

const LIMITE_HISTORICO = 100;

// Atributos que descrevem a geometria (saem quando a forma vira path)
const GEOMETRIA = new Set(["d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "points", "x1", "y1", "x2", "y2", "pathLength"]);

// Valores que o SVG assume quando um atributo de desenho não é informado
export const PADRAO_DESENHO = {
  fill: "black",
  stroke: "none",
  "stroke-width": "1",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-miterlimit": "4",
  "fill-rule": "nonzero",
  "clip-rule": "nonzero",
  opacity: "1",
};

const escaparAtributo = (valor) =>
  String(valor).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const atributos = (attrs) =>
  Object.entries(attrs)
    .map(([nome, valor]) => ` ${nome}="${escaparAtributo(valor)}"`)
    .join("");

export function viewBoxDe(raiz) {
  const [x, y, w, h] = String(raiz.viewBox || "0 0 24 24")
    .split(/[\s,]+/)
    .map(Number);
  return { x: x || 0, y: y || 0, w: w || 24, h: h || 24 };
}

// Tamanho sugerido para o PNG, em pixels: a largura do <svg> quando é um
// número (ou "24px"); "1em", "100%" e afins usam a largura do viewBox
export function tamanhoDoPng(raiz) {
  const largura = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(raiz.width ?? "");
  const tamanho = largura ? Number(largura[1]) : viewBoxDe(raiz).w;
  return Math.round(tamanho) || 24;
}

// Elementos que um ícone usa. Fora desta lista, o elemento sai inteiro
const ELEMENTOS_SVG = new Set([
  ...FORMAS,
  "g", "defs", "use", "symbol", "title", "desc", "text", "tspan",
  "clipPath", "mask", "linearGradient", "radialGradient", "stop", "pattern", "marker",
]);
const SVG_NS = "http://www.w3.org/2000/svg";

// Tira de dentro de "no" tudo que não é texto nem elemento SVG da lista
function limparNos(no) {
  for (const filho of [...no.childNodes]) {
    if (filho.nodeType === 3) continue;
    if (filho.nodeType === 1 && filho.namespaceURI === SVG_NS && ELEMENTOS_SVG.has(filho.localName)) limparNos(filho);
    else filho.remove();
  }
}

// Texto SVG → documento do editor. Usa o DOMParser do navegador.
// Elementos fora de FORMAS (g, text, use…) são mantidos como estão, em
// "html", e só podem ser mudados pelo código.
export function lerSvg(texto) {
  const doc = new DOMParser().parseFromString(texto, "image/svg+xml");
  const erro = doc.querySelector("parsererror");
  if (erro) {
    const detail = erro.textContent.split("\n").find((l) => l.trim()) || "";
    throw erroCom("error.svgInvalid", "Invalid SVG: " + detail, { detail });
  }
  const raiz = doc.documentElement;
  if (raiz.localName !== "svg")
    throw erroCom("error.svgRoot", "The code must start with <svg>");
  // Nada que execute código: o código pode ter sido colado, vir de um link
  // #svg= ou de um .ile de outra pessoa, e o SVG final vai para innerHTML
  // (lista de rascunho, prévias), onde o parser HTML lê diferente do XML.
  // Por isso a limpeza é por lista do que fica, não do que sai:
  // - comentários, <?…?> e CDATA saem — um "<img onerror>" escondido neles é
  //   inerte em XML e vira HTML de verdade no innerHTML;
  // - só ficam elementos SVG de desenho (sem <a>, <set>, <animate>, <meta>,
  //   <script>, <foreignObject>…);
  // - saem atributos de evento (onload…) e links que não apontam para dentro
  //   do próprio SVG (href="#id" continua, para <use> e gradientes).
  limparNos(raiz);
  for (const no of [raiz, ...raiz.querySelectorAll("*")])
    for (const at of [...no.attributes])
      if (/^on/i.test(at.name) || (/(^|:)href$/i.test(at.name) && !/^\s*#/.test(at.value)))
        no.removeAttribute(at.name);
  const attrsDe = (no) =>
    Object.fromEntries([...no.attributes].map((at) => [at.name, at.value]));
  return {
    raiz: attrsDe(raiz),
    elementos: [...raiz.children].map((no) =>
      FORMAS.has(no.localName)
        ? { tag: no.localName, attrs: attrsDe(no) }
        : {
            tag: no.localName,
            html: new XMLSerializer()
              .serializeToString(no)
              .replace(/\sxmlns="[^"]*"/, ""),
          },
    ),
  };
}

// ── Arquivo .ile ─────────────────────────────────────────────────────────────
// Projeto do editor em texto (JSON): guarda o que o SVG sozinho perde — de
// que ícone veio cada forma, as formas ocultas e o nome.
export const FORMATO_ILE = "icon-library-editor";
export const VERSAO_ILE = 1;
// Um ícone tem poucos KB; isso barra arquivos trocados por engano
export const TAMANHO_MAXIMO_ILE = 2 * 1024 * 1024;

const NOME_VALIDO = /^[a-zA-Z_:][\w:.-]*$/;

const texto = (valor) => typeof valor === "string";
const objetoDeTextos = (valor) =>
  valor !== null &&
  typeof valor === "object" &&
  !Array.isArray(valor) &&
  Object.entries(valor).every(([nome, v]) => NOME_VALIDO.test(nome) && texto(v));

// Confere a estrutura de um .ile já lido como JSON e devolve só os campos
// conhecidos. Erros viram mensagens para o usuário. Não interpreta o SVG —
// isso fica para carregarProjeto, que passa tudo pela limpeza de lerSvg.
export function validarProjeto(dados) {
  const invalido = (codigo, motivo, valores) =>
    erroCom("error.ileInvalid", `Not a valid .ile file: ${motivo}`, {
      reason: erroCom(codigo, motivo, valores),
    });
  if (!dados || typeof dados !== "object" || dados.formato !== FORMATO_ILE)
    throw invalido("ile.notIconLibrary", "it was not saved by Icon Library");
  if (!Number.isInteger(dados.versao) || dados.versao < 1)
    throw invalido("ile.version", "unknown version");
  if (dados.versao > VERSAO_ILE)
    throw erroCom("error.ileNewer", "This .ile file was saved by a newer version of Icon Library");
  if (!objetoDeTextos(dados.raiz)) throw invalido("ile.root", "bad <svg> attributes");
  const nome = texto(dados.nome) && dados.nome.trim() ? dados.nome.trim() : "icon";
  // Projetos escritos à mão (ou por uma IA) podem omitir os grupos: tudo
  // fica num ícone só. Os salvos pelo editor sempre os trazem.
  const grupos = dados.grupos === undefined ? [{ nome }] : dados.grupos;
  if (!Array.isArray(grupos) || !grupos.length || !grupos.every((g) => texto(g?.nome)))
    throw invalido("ile.icons", "bad icon list");
  if (!Array.isArray(dados.elementos)) throw invalido("ile.shapes", "bad shape list");
  const elementos = dados.elementos.map((el, i) => {
    const forma = `shape ${i + 1}`;
    const n = i + 1;
    if (!el || !texto(el.tag) || !/^[a-zA-Z][\w-]*$/.test(el.tag)) throw invalido("ile.shapeTag", `${forma} has no valid tag`, { n });
    const grupo = el.grupo ?? 0;
    if (!Number.isInteger(grupo) || grupo < 0 || grupo >= grupos.length)
      throw invalido("ile.shapeGroup", `${forma} belongs to no icon`, { n });
    const base = { tag: el.tag, grupo, oculto: el.oculto === true };
    if (texto(el.html)) return { ...base, html: el.html };
    if (!FORMAS.has(el.tag) || !objetoDeTextos(el.attrs)) throw invalido("ile.shapeAttrs", `${forma} has bad attributes`, { n });
    return { ...base, attrs: el.attrs };
  });
  return {
    nome,
    editavel: dados.editavel === true,
    raiz: dados.raiz,
    grupos: grupos.map((g) => (g.manual === true ? { nome: g.nome, manual: true } : { nome: g.nome })),
    elementos,
  };
}

// Estado do editor: o ícone sendo editado (um ou mais ícones sobrepostos,
// cada um num grupo), a seleção, o encaixe na grade e o histórico de
// desfazer/refazer. Não conhece o DOM (exceto lerSvg).
export class EditorModel {
  raiz = {};
  // { tag, attrs, grupo, oculto } ou { tag, html, grupo, oculto }
  elementos = [];
  // [{ nome, manual? }]. O primeiro é o ícone aberto, de formas soltas. Os
  // demais são grupos: ícones postos por cima ou formas agrupadas à mão
  // (manual), que se movem juntos e se selecionam inteiros com um clique.
  grupos = [];
  // Seleção: uma forma (selecionado), várias (selecionado + extras) ou um
  // grupo inteiro (grupoSelecionado)
  selecionado = null;
  grupoSelecionado = null;
  extras = [];
  // Encaixe na grade, em unidades do ícone (0 = livre)
  passo = 0.5;
  historico = [];
  refazer = [];
  // Cópia dos elementos no início de um arraste: cada movimento parte dela,
  // sem acumular arredondamentos
  base = null;
  // Ponto clicado na forma selecionada (id de pontosDoElemento), para apagar
  // ou acrescentar pontos
  pontoSelecionado = null;
  // Copiar e colar: { elementos, nome } e quantas vezes já foi colado
  copiados = null;
  colagens = 0;
  // O SVG como foi aberto, para comparar com o atual
  original = "";

  // Com desfazivel, abrir vira um passo do histórico (Undo volta ao ícone
  // anterior); sem, o histórico começa do zero
  carregar(texto, nome = "icon", { desfazivel = false } = {}) {
    const doc = lerSvg(texto);
    if (desfazivel) this.registrar();
    else {
      this.historico = [];
      this.refazer = [];
    }
    this.definirDocumento(doc, nome);
    this.original = this.svg();
  }

  // Troca o documento sem mexer no histórico
  definirDocumento({ raiz, elementos }, nome = "icon") {
    this.raiz = raiz;
    this.grupos = [{ nome }];
    this.elementos = elementos.map((el) => ({ ...el, grupo: 0, oculto: false }));
    this.limparSelecao();
  }

  // Código digitado pelo usuário: vira um passo do histórico. Um path com
  // dado inválido é recusado aqui, com a mensagem do erro, em vez de sumir
  // em silêncio do desenho.
  aplicarCodigo(texto) {
    const doc = lerSvg(texto);
    doc.elementos.forEach((el, i) => {
      if (el.tag !== "path") return;
      try {
        lerPath(el.attrs.d ?? "");
      } catch (erro) {
        throw erroCom("error.path", `Path ${i + 1}: ${erro.message}`, { n: i + 1, detail: erro });
      }
    });
    this.aplicarDocumento(doc);
  }

  // O documento lido do código entra no lugar do atual. O código mostra só
  // as formas visíveis: elas casam pela posição entre as visíveis e mantêm o
  // grupo; as ocultas continuam onde estavam; as novas vão para o primeiro
  // ícone e as que sumiram do código saem.
  aplicarDocumento(doc) {
    this.registrar();
    const novos = [...doc.elementos];
    const elementos = [];
    for (const anterior of this.elementos) {
      if (anterior.oculto) elementos.push(anterior);
      else if (novos.length) elementos.push({ ...novos.shift(), grupo: anterior.grupo, oculto: false });
    }
    for (const el of novos) elementos.push({ ...el, grupo: 0, oculto: false });
    this.raiz = doc.raiz;
    this.elementos = elementos;
    this.limparSelecao();
  }

  get viewBox() {
    return viewBoxDe(this.raiz);
  }

  get centro() {
    const { x, y, w, h } = this.viewBox;
    return { cx: x + w / 2, cy: y + h / 2 };
  }

  // Texto final. Elementos ocultos ficam de fora — ocultar é para ver como o
  // ícone fica sem eles antes de apagar.
  // Degradês que nenhuma forma visível usa ficam de fora.
  svg() {
    this.ajustarDegrades();
    const usados = this.degradesEmUso();
    const filhos = this.elementos
      .filter((el) => !el.oculto && (!ehDegrade(el) || usados.has(this.idDoElemento(el))))
      .map((el) => (el.html ? el.html : `<${el.tag}${atributos(el.attrs)}/>`))
      .join("");
    return `<svg${atributos(this.raiz)}>${filhos}</svg>`;
  }

  encaixar(valor) {
    return this.passo
      ? Math.round(valor / this.passo) * this.passo
      : Math.round(valor * 100) / 100;
  }

  // Valor de um atributo de desenho como o navegador vai usar: o da forma,
  // senão o herdado da tag <svg>, senão o padrão do SVG
  efetivo(el, atributo) {
    return el.attrs?.[atributo] ?? this.raiz[atributo] ?? PADRAO_DESENHO[atributo];
  }

  // ── Histórico ────────────────────────────────────────────────────────────
  // Guarda o estado atual antes de uma mudança
  registrar() {
    this.historico.push(this.instantaneo());
    if (this.historico.length > LIMITE_HISTORICO) this.historico.shift();
    this.refazer = [];
  }

  instantaneo() {
    return JSON.stringify({
      raiz: this.raiz,
      elementos: this.elementos,
      grupos: this.grupos,
    });
  }

  restaurar(texto) {
    const { raiz, elementos, grupos } = JSON.parse(texto);
    this.raiz = raiz;
    this.elementos = elementos;
    this.grupos = grupos;
    if (this.selecionado !== null && !this.elementos[this.selecionado])
      this.selecionado = null;
    this.extras = this.selecionado === null ? [] : this.extras.filter((i) => this.elementos[i]);
    this.pontoSelecionado = null;
    if (!this.indicesDoGrupo(this.grupoSelecionado).length)
      this.grupoSelecionado = null;
  }

  get podeDesfazer() {
    return this.historico.length > 0;
  }

  get podeRefazer() {
    return this.refazer.length > 0;
  }

  // Durante um arraste, desfazer, refazer e apagar esperam: o arraste ainda
  // escreve nas formas a partir da cópia do início, e o histórico ficaria
  // sem o passo dele
  get arrastando() {
    return this.base !== null;
  }

  desfazer() {
    if (!this.podeDesfazer || this.arrastando) return;
    this.refazer.push(this.instantaneo());
    this.restaurar(this.historico.pop());
  }

  refazerUltimo() {
    if (!this.podeRefazer || this.arrastando) return;
    this.historico.push(this.instantaneo());
    this.restaurar(this.refazer.pop());
  }

  // ── Seleção ──────────────────────────────────────────────────────────────
  limparSelecao() {
    this.selecionado = null;
    this.extras = [];
    this.grupoSelecionado = null;
    this.pontoSelecionado = null;
  }

  selecionar(indice) {
    this.grupoSelecionado = null;
    this.extras = [];
    if (indice !== this.selecionado) this.pontoSelecionado = null;
    this.selecionado =
      indice !== null && this.elementos[indice] ? indice : null;
  }

  selecionarGrupo(grupo) {
    this.selecionado = null;
    this.extras = [];
    this.pontoSelecionado = null;
    this.grupoSelecionado = this.indicesDoGrupo(grupo).length ? grupo : null;
  }

  // Seleciona exatamente estas formas; um grupo completo vira seleção de grupo
  definirSelecao(indices) {
    const lista = [...new Set(indices)].filter((i) => this.elementos[i]);
    this.limparSelecao();
    if (!lista.length) return;
    const grupo = this.elementos[lista[0]].grupo;
    if (grupo !== 0 && lista.length === this.indicesDoGrupo(grupo).length &&
      lista.every((i) => this.elementos[i].grupo === grupo)) {
      this.grupoSelecionado = grupo;
      return;
    }
    [this.selecionado, ...this.extras] = lista;
  }

  // A forma ou, se ela faz parte de um grupo, o grupo todo
  blocoDe(indice) {
    const grupo = this.elementos[indice]?.grupo;
    return grupo ? this.indicesDoGrupo(grupo) : [indice];
  }

  // Clique numa forma: dentro da seleção atual, ela continua (para arrastar
  // tudo); numa forma de um grupo, seleciona o grupo — a não ser que o duplo
  // clique já tenha entrado nele, e aí o clique troca de forma ali dentro
  clicarForma(indice) {
    const el = this.elementos[indice];
    if (!el) return;
    if (this.grupoSelecionado !== null && el.grupo === this.grupoSelecionado) return;
    if (this.extras.length && this.alvos().includes(indice)) return;
    const dentro = this.selecionado !== null && !this.extras.length &&
      this.elementos[this.selecionado].grupo === el.grupo;
    if (el.grupo && !dentro) this.selecionarGrupo(el.grupo);
    else this.selecionar(indice);
  }

  // Shift+clique: soma a forma (ou o grupo dela) à seleção; se já estava
  // selecionada, tira
  adicionarASelecao(indice) {
    if (!this.elementos[indice]) return;
    const atual = this.temSelecao ? this.alvos() : [];
    const bloco = this.blocoDe(indice);
    this.definirSelecao(
      bloco.every((i) => atual.includes(i))
        ? atual.filter((i) => !bloco.includes(i))
        : [...atual, ...bloco],
    );
  }

  // Retângulo { x1, y1, x2, y2 } desenhado no canvas: pega o que tocar na linha
  // desenhada (com a espessura dela). Formas ocultas e só de código ficam de
  // fora. Com somar, junta à seleção atual; sem, substitui.
  selecionarArea({ x1, y1, x2, y2 }, { somar = false } = {}) {
    const tocadas = this.elementos.flatMap((el, i) => {
      if (el.oculto || !this.editavel(i)) return [];
      const metade = this.efetivo(el, "stroke") === "none"
        ? 0
        : (parseFloat(this.efetivo(el, "stroke-width")) || 0) / 2;
      const ret = { x1: x1 - metade, y1: y1 - metade, x2: x2 + metade, y2: y2 + metade };
      return formaTocaRetangulo(el, ret) ? this.blocoDe(i) : [];
    });
    this.definirSelecao([...(somar && this.temSelecao ? this.alvos() : []), ...tocadas]);
  }

  selecionarTudo() {
    this.definirSelecao(this.elementos.flatMap((el, i) => (el.oculto || ehDegrade(el) ? [] : [i])));
  }

  // Ver camadas: o número do bloco de cada forma, na ordem do desenho. Um
  // grupo é um bloco só; cada forma solta é o seu próprio bloco.
  blocosDasCamadas() {
    const blocos = new Map();
    return this.elementos.map((el, i) => {
      const chave = el.grupo ? `grupo${el.grupo}` : `forma${i}`;
      if (!blocos.has(chave)) blocos.set(chave, blocos.size);
      return blocos.get(chave);
    });
  }

  // Quantas formas estão selecionadas
  get quantidade() {
    return this.temSelecao ? this.alvos().length : 0;
  }

  get podeUnir() {
    if (this.quantidade === 1) return Boolean(this.uniaoDaForma);
    if (this.quantidade !== 2) return false;
    const [a, b] = this.alvos();
    return podeUnir(this.elementos[a], this.elementos[b]);
  }

  // O ponto do traço escolhido na forma selecionada, para a união interna.
  // Alças de curva não contam.
  get pontoDaUniao() {
    const ponto = this.pontosSelecionados().find((p) => p.id === this.pontoSelecionado);
    return ponto?.tipo === "end" ? ponto : null;
  }

  // Uma linha aberta selecionada: fechar, ou ligar a ponta ao ponto escolhido
  get uniaoDaForma() {
    if (this.quantidade !== 1) return null;
    return uniaoInterna(this.elementos[this.alvos()[0]], this.pontoDaUniao);
  }

  // Uma linha aberta sozinha: falta só marcar a outra para poder unir
  get linhaAberta() {
    if (this.quantidade !== 1) return false;
    const el = this.elementos[this.alvos()[0]];
    return podeUnir(el, el);
  }

  // As pontas que Unir ligaria, para mostrar no desenho antes de agir
  get ligacaoDaUniao() {
    if (!this.podeUnir) return null;
    if (this.quantidade === 1) return this.uniaoDaForma;
    const [a, b] = this.alvos();
    return pontasDaUniao(this.elementos[a], this.elementos[b]);
  }

  // Separar: uma forma só selecionada, que o editor sabe desenhar
  get podeSeparar() {
    return this.selecionado !== null && !this.extras.length && this.editavel(this.selecionado);
  }

  // Corta a forma selecionada no ponto do traço mais perto de (x, y). Uma
  // forma aberta vira duas (a segunda logo acima dela, as duas marcadas);
  // uma fechada se abre ali. Devolve se cortou — clicar longe do traço, ou
  // numa ponta da linha, não corta.
  separar(x, y) {
    if (!this.podeSeparar) return false;
    const i = this.selecionado;
    const el = this.elementos[i];
    // Vale o clique em cima do traço desenhado, com uma pequena folga
    const largura = parseFloat(this.efetivo(el, "stroke-width")) || 0;
    const tolerancia = Math.max(largura / 2, 0.25) + this.viewBox.w / 48;
    const corte = separarForma(el, x, y, tolerancia);
    if (!corte) return false;
    this.registrar();
    const pedacos = corte.elementos.map((p) => ({ ...p, grupo: el.grupo, oculto: false }));
    this.elementos.splice(i, 1, ...pedacos);
    this.selecionar(i);
    if (pedacos.length > 1) this.extras = [i + 1];
    return true;
  }

  // Une as duas formas marcadas num path só, no lugar da primeira (na ordem
  // do desenho), ou faz a união dentro da forma selecionada. Devolve se uniu.
  unir() {
    if (!this.podeUnir) return false;
    if (this.quantidade === 1) {
      const indice = this.alvos()[0];
      const nova = aplicarUniaoInterna(this.elementos[indice], this.pontoDaUniao);
      this.registrar();
      this.elementos[indice] = nova;
      this.pontoSelecionado = null;
      return true;
    }
    const [a, b] = this.alvos();
    const [i, j] = [a, b].sort((p, q) => p - q);
    const unido = unirTracos(this.elementos[a], this.elementos[b]);
    this.registrar();
    this.elementos[i] = { ...unido, grupo: this.elementos[i].grupo, oculto: false };
    this.elementos.splice(j, 1);
    this.selecionar(i);
    return true;
  }

  // ── Agrupar ──────────────────────────────────────────────────────────────
  // Só faz sentido com formas que ainda não são, sozinhas, um grupo
  get podeAgrupar() {
    return this.quantidade > 1 && !this.grupoSelecionado;
  }

  get podeDesagrupar() {
    return this.temSelecao && this.alvos().some((i) => this.elementos[i].grupo !== 0);
  }

  // As formas viram um bloco seguido, na altura da que está mais acima
  agrupar(nome) {
    if (!this.podeAgrupar) return false;
    const membros = new Set(this.alvos());
    const topo = Math.max(...membros);
    this.registrar();
    const grupo = this.grupos.push({ nome, manual: true }) - 1;
    const bloco = [...membros].sort((a, b) => a - b).map((i) => ({ ...this.elementos[i], grupo }));
    this.elementos = this.elementos.flatMap((el, i) =>
      i === topo ? bloco : membros.has(i) ? [] : [el],
    );
    this.selecionarGrupo(grupo);
    return true;
  }

  // Os grupos da seleção se desfazem: as formas ficam soltas e selecionadas
  desagrupar() {
    if (!this.podeDesagrupar) return false;
    const grupos = new Set(this.alvos().map((i) => this.elementos[i].grupo));
    grupos.delete(0);
    const soltas = this.elementos.flatMap((el, i) => (grupos.has(el.grupo) ? [i] : []));
    this.registrar();
    for (const i of soltas) this.elementos[i] = { ...this.elementos[i], grupo: 0 };
    this.definirSelecao(soltas);
    return true;
  }

  indicesDoGrupo(grupo) {
    if (grupo === null) return [];
    return this.elementos.flatMap((el, i) => (el.grupo === grupo && !ehDegrade(el) ? [i] : []));
  }

  // Ícones com formas, na ordem do desenho (o de baixo primeiro):
  // [{ grupo, nome, indices }]
  gruposEmUso() {
    return this.grupos
      .map((g, grupo) => ({ grupo, nome: g.nome, indices: this.indicesDoGrupo(grupo) }))
      .filter((g) => g.indices.length)
      .sort((a, b) => a.indices[0] - b.indices[0]);
  }

  // ── Ordem (o último elemento é desenhado por cima) ───────────────────────
  // operacao: "frente" e "tras" (um passo), "topo" e "fundo" (até a ponta).
  // Uma forma muda de lugar entre as formas do próprio grupo; um grupo
  // inteiro, entre os outros; várias formas sobem ou descem juntas, mantendo
  // a ordem entre elas. Devolve se algo mudou.
  ordenar(operacao) {
    const passo = { frente: 1, tras: -1, topo: Infinity, fundo: -Infinity }[operacao];
    if (passo === undefined) return false;
    if (this.extras.length) return this.ordenarConjunto(passo);
    if (this.selecionado !== null) {
      const el = this.elementos[this.selecionado];
      const irmaos = this.indicesDoGrupo(el.grupo);
      const atual = irmaos.indexOf(this.selecionado);
      const destino = Math.max(0, Math.min(irmaos.length - 1, atual + passo));
      if (destino === atual) return false;
      this.registrar();
      const ordem = irmaos.map((i) => this.elementos[i]);
      ordem.splice(destino, 0, ...ordem.splice(atual, 1));
      irmaos.forEach((i, k) => (this.elementos[i] = ordem[k]));
      this.selecionado = irmaos[destino];
      return true;
    }
    if (this.grupoSelecionado === null) return false;
    // Blocos na ordem do desenho: cada grupo é um, e cada sequência de formas
    // soltas é outra. O grupo troca de lugar só com o bloco vizinho — juntar
    // todas as soltas num bloco só mudava a ordem de quem nem foi mexido.
    const blocos = this.blocosDeOrdem();
    const atual = blocos.findIndex((b) => b.grupo === this.grupoSelecionado);
    const destino = Math.max(0, Math.min(blocos.length - 1, atual + passo));
    if (atual < 0 || destino === atual) return false;
    this.registrar();
    blocos.splice(destino, 0, ...blocos.splice(atual, 1));
    this.elementos = blocos.flatMap((b) => b.indices.map((i) => this.elementos[i]));
    return true;
  }

  // [{ grupo, indices }]: um bloco por grupo (na posição da primeira forma
  // dele) e um por sequência seguida de formas soltas
  blocosDeOrdem() {
    const blocos = [];
    const doGrupo = new Map();
    this.elementos.forEach((el, i) => {
      if (el.grupo) {
        if (!doGrupo.has(el.grupo)) doGrupo.set(el.grupo, blocos.push({ grupo: el.grupo, indices: [] }) - 1);
        blocos[doGrupo.get(el.grupo)].indices.push(i);
      } else if (blocos.at(-1)?.grupo === 0) blocos.at(-1).indices.push(i);
      else blocos.push({ grupo: 0, indices: [i] });
    });
    return blocos;
  }

  ordenarConjunto(passo) {
    const marcadas = new Set(this.alvos());
    const pares = this.elementos.map((el, i) => ({ el, marcada: marcadas.has(i) }));
    let nova;
    if (Math.abs(passo) === Infinity) {
      const juntas = pares.filter((p) => p.marcada);
      const resto = pares.filter((p) => !p.marcada);
      nova = passo > 0 ? [...resto, ...juntas] : [...juntas, ...resto];
    } else {
      nova = [...pares];
      const ordem = nova.map((_, k) => k);
      if (passo > 0) ordem.reverse();
      for (const k of ordem) {
        const vizinha = nova[k + passo];
        if (nova[k].marcada && vizinha && !vizinha.marcada)
          [nova[k], nova[k + passo]] = [vizinha, nova[k]];
      }
    }
    if (nova.every((p, k) => p === pares[k])) return false;
    this.registrar();
    this.elementos = nova.map((p) => p.el);
    this.definirSelecao(nova.flatMap((p, k) => (p.marcada ? [k] : [])));
    return true;
  }

  get temSelecao() {
    return this.selecionado !== null || this.grupoSelecionado !== null;
  }

  // Alvo das ações: a forma, o ícone selecionado ou, sem seleção, tudo
  alvos() {
    if (this.selecionado !== null) return [this.selecionado, ...this.extras];
    if (this.grupoSelecionado !== null) return this.indicesDoGrupo(this.grupoSelecionado);
    return this.elementos.flatMap((el, i) => (ehDegrade(el) ? [] : [i]));
  }

  // Editável no desenho: forma conhecida e, se for path, com dado legível
  editavel(indice) {
    const el = this.elementos[indice];
    if (!el || el.html) return false;
    if (el.tag !== "path") return true;
    try {
      lerPath(el.attrs.d ?? "");
      return true;
    } catch {
      return false;
    }
  }

  // ── Pontos ───────────────────────────────────────────────────────────────
  // Quanto o ponto mais afastado (de qualquer elemento) sai da área do
  // ícone, em unidades — o editor abre essa margem para ele ficar ao alcance
  pontosForaDaArea() {
    const { x, y, w, h } = this.viewBox;
    let fora = 0;
    this.elementos.forEach((el, i) => {
      if (el.oculto || !this.editavel(i)) return;
      for (const p of pontosDoElemento(el))
        fora = Math.max(fora, x - p.x, y - p.y, p.x - (x + w), p.y - (y + h));
    });
    return fora;
  }

  // Pontos arrastáveis: só com uma forma selecionada
  pontosSelecionados() {
    if (this.selecionado === null || this.extras.length || !this.editavel(this.selecionado))
      return [];
    return pontosDoElemento(this.elementos[this.selecionado]);
  }

  // ── Apagar e acrescentar pontos ──────────────────────────────────────────
  // Clique num ponto da forma selecionada (as alças de curva também ficam
  // marcadas, mas só os pontos do traço podem ser apagados ou ganhar vizinho)
  selecionarPonto(id) {
    const existe = this.pontosSelecionados().some((p) => p.id === id);
    this.pontoSelecionado = existe ? id : null;
  }

  get podeRemoverPonto() {
    if (this.pontoSelecionado === null) return false;
    return removerPonto(this.elementos[this.selecionado], this.pontoSelecionado) !== null;
  }

  get podeAdicionarPonto() {
    if (this.pontoSelecionado === null) return false;
    return adicionarPonto(this.elementos[this.selecionado], this.pontoSelecionado) !== null;
  }

  removerPontoSelecionado() {
    if (!this.podeRemoverPonto) return false;
    this.registrar();
    const i = this.selecionado;
    this.elementos[i] = { ...this.elementos[i], ...removerPonto(this.elementos[i], this.pontoSelecionado) };
    this.pontoSelecionado = null;
    return true;
  }

  // O ponto novo fica selecionado: dá para acrescentar outro logo em seguida
  adicionarPontoNoSelecionado() {
    if (!this.podeAdicionarPonto) return false;
    this.registrar();
    const i = this.selecionado;
    const { elemento, id } = adicionarPonto(this.elementos[i], this.pontoSelecionado);
    this.elementos[i] = { ...this.elementos[i], ...elemento };
    this.pontoSelecionado = id;
    return true;
  }

  // Caixa em volta das formas: { minX, minY, maxX, maxY }, ou null
  limitesDe(indices) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const i of indices) {
      const limites = this.editavel(i) ? limitesDoElemento(this.elementos[i]) : null;
      if (!limites) continue;
      minX = Math.min(minX, limites.minX);
      minY = Math.min(minY, limites.minY);
      maxX = Math.max(maxX, limites.maxX);
      maxY = Math.max(maxY, limites.maxY);
    }
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  // Centro dos pontos das formas, encaixado em meia unidade — girar e
  // espelhar em volta dele mantém os pontos na grade
  centroDe(indices) {
    const limites = this.limitesDe(indices);
    if (!limites) return this.centro;
    const meio = (v) => Math.round(v * 2) / 2;
    return { cx: meio((limites.minX + limites.maxX) / 2), cy: meio((limites.minY + limites.maxY) / 2) };
  }

  // ── Arraste: iniciar → mover (quantas vezes for) → terminar ──────────────
  iniciarArraste() {
    if (!this.temSelecao) return false;
    const indices = this.alvos().filter((i) => this.editavel(i));
    if (!indices.length) return false;
    this.registrar();
    this.alvosDoArraste = null;
    this.guias = [];
    this.base = new Map(indices.map((i) => [i, this.elementos[i]]));
    return true;
  }

  // ── Encaixe em outras formas, com linhas-guia ────────────────────────────
  // Durante um arraste, o ponto (ou a caixa do que se move) gruda nos pontos
  // e nas caixas das outras formas e no centro e nas bordas do ícone quando
  // chega a menos de "tolerancia" unidades. As linhas-guia ficam em guias:
  // [{ x }] ou [{ y }]. Sem tolerância, vale só a grade.
  guias = [];

  // Valores de x e de y em que vale grudar: calculados uma vez por arraste
  alvosDeEncaixe(idIgnorado = null) {
    if (this.alvosDoArraste) return this.alvosDoArraste;
    const { x, y, w, h } = this.viewBox;
    const xs = [x, x + w / 2, x + w];
    const ys = [y, y + h / 2, y + h];
    this.elementos.forEach((el, i) => {
      if (el.oculto || !this.editavel(i)) return;
      if (this.base.has(i)) {
        // A própria forma: os outros pontos dela (para alinhar um com outro)
        if (idIgnorado === null) return;
        for (const p of pontosDoElemento(this.base.get(i)))
          if (p.id !== idIgnorado && p.tipo === "end") xs.push(p.x), ys.push(p.y);
        return;
      }
      const c = limitesDoElemento(el);
      if (c) xs.push(c.minX, (c.minX + c.maxX) / 2, c.maxX), ys.push(c.minY, (c.minY + c.maxY) / 2, c.maxY);
      for (const p of pontosDoElemento(el)) if (p.tipo === "end") xs.push(p.x), ys.push(p.y);
    });
    this.alvosDoArraste = { xs, ys };
    return this.alvosDoArraste;
  }

  // O alvo mais perto de algum dos valores, se estiver dentro da tolerância:
  // { desvio, alvo } (somar o desvio ao valor gruda nele), ou null
  static maisPerto(valores, alvos, tolerancia) {
    let melhor = null;
    for (const v of valores)
      for (const a of alvos) {
        const d = a - v;
        if (Math.abs(d) <= tolerancia && (!melhor || Math.abs(d) < Math.abs(melhor.desvio))) melhor = { desvio: d, alvo: a };
      }
    return melhor;
  }

  arrastarPonto(id, x, y, { tolerancia = 0 } = {}) {
    if (!this.base || this.selecionado === null) return;
    let [px, py] = [this.encaixar(x), this.encaixar(y)];
    this.guias = [];
    if (tolerancia > 0) {
      const { xs, ys } = this.alvosDeEncaixe(id);
      const gx = EditorModel.maisPerto([x], xs, tolerancia);
      const gy = EditorModel.maisPerto([y], ys, tolerancia);
      if (gx) (px = gx.alvo), this.guias.push({ x: gx.alvo });
      if (gy) (py = gy.alvo), this.guias.push({ y: gy.alvo });
    }
    this.elementos[this.selecionado] = moverPonto(this.base.get(this.selecionado), id, px, py);
  }

  arrastarElemento(dx, dy, { tolerancia = 0 } = {}) {
    if (!this.base) return;
    let [mx, my] = [this.encaixar(dx), this.encaixar(dy)];
    this.guias = [];
    if (tolerancia > 0) {
      const c = this.caixaDaBase();
      if (c) {
        const { xs, ys } = this.alvosDeEncaixe();
        const bordas = (a, b, d) => [a + d, (a + b) / 2 + d, b + d];
        const gx = EditorModel.maisPerto(bordas(c.minX, c.maxX, dx), xs, tolerancia);
        const gy = EditorModel.maisPerto(bordas(c.minY, c.maxY, dy), ys, tolerancia);
        if (gx) (mx = dx + gx.desvio), this.guias.push({ x: gx.alvo });
        if (gy) (my = dy + gy.desvio), this.guias.push({ y: gy.alvo });
      }
    }
    const m = matrizes.mover(mx, my);
    for (const [i, el] of this.base) this.elementos[i] = transformarElemento(el, m);
  }

  // Caixa das formas como estavam no início do arraste
  caixaDaBase() {
    if (!this.base) return null;
    let c = null;
    for (const el of this.base.values()) {
      const l = limitesDoElemento(el);
      if (!l) continue;
      c = c
        ? { minX: Math.min(c.minX, l.minX), minY: Math.min(c.minY, l.minY), maxX: Math.max(c.maxX, l.maxX), maxY: Math.max(c.maxY, l.maxY) }
        : l;
    }
    return c;
  }

  // Alças da caixa de seleção: k vezes o tamanho a partir do ponto fixo
  // (o canto oposto), e giro em graus em volta do centro
  arrastarEscala(k, fx, fy) {
    if (!(k > 0)) return;
    this.arrastarComMatriz(matrizes.escalar(k, fx, fy));
  }

  arrastarGiro(graus, cx, cy) {
    this.arrastarComMatriz(matrizes.girar(graus, cx, cy));
  }

  terminarArraste() {
    // Um clique sem movimento não deixa passo vazio no histórico
    if (this.base && [...this.base].every(([i, el]) => this.elementos[i] === el))
      this.historico.pop();
    this.base = null;
    this.alvosDoArraste = null;
    this.guias = [];
  }

  // Tab no desenho: a forma visível seguinte (passo 1) ou anterior (-1). Sem
  // forma selecionada, a primeira (ou a última). Devolve o índice escolhido,
  // ou null depois da última (o Tab segue para o próximo controle da janela).
  selecionarVizinha(passo) {
    const visiveis = this.elementos.flatMap((el, i) => (el.oculto ? [] : [i]));
    if (!visiveis.length) return null;
    const atual = this.selecionado !== null && !this.extras.length ? visiveis.indexOf(this.selecionado) : -1;
    const proxima = atual < 0 ? (passo > 0 ? visiveis[0] : visiveis.at(-1)) : visiveis[atual + passo];
    if (proxima === undefined) return null;
    this.selecionar(proxima);
    return proxima;
  }

  // ── Caneta ───────────────────────────────────────────────────────────────
  // Um path desenhado ponto a ponto entra como forma nova, já selecionada
  adicionarPath(d) {
    try {
      lerPath(d);
    } catch {
      return false;
    }
    this.registrar();
    this.elementos.push({ tag: "path", attrs: { d }, grupo: 0, oculto: false });
    this.selecionar(this.elementos.length - 1);
    return true;
  }

  // ── Lista de formas ──────────────────────────────────────────────────────
  // Arrastar na lista: a forma "de" vai para o lugar da forma "para", só
  // entre formas do mesmo ícone ou grupo. Devolve se mudou.
  moverForma(de, para) {
    const a = this.elementos[de];
    const b = this.elementos[para];
    if (!a || !b || de === para || a.grupo !== b.grupo || this.arrastando) return false;
    const irmaos = this.indicesDoGrupo(a.grupo);
    const ordem = irmaos.map((i) => this.elementos[i]);
    const [origem, destino] = [irmaos.indexOf(de), irmaos.indexOf(para)];
    this.registrar();
    ordem.splice(destino, 0, ...ordem.splice(origem, 1));
    irmaos.forEach((i, k) => (this.elementos[i] = ordem[k]));
    this.selecionar(irmaos[destino]);
    return true;
  }

  // Nome de um grupo (o ícone aberto, grupo 0, leva o nome do arquivo)
  renomearGrupo(grupo, nome) {
    const limpo = String(nome ?? "").trim().slice(0, 60);
    if (!grupo || !this.grupos[grupo] || !limpo || this.grupos[grupo].nome === limpo) return false;
    this.registrar();
    this.grupos = this.grupos.map((g, i) => (i === grupo ? { ...g, nome: limpo } : g));
    return true;
  }

  // ── Elementos ────────────────────────────────────────────────────────────
  adicionar(tag) {
    this.registrar();
    this.elementos.push({ ...novaForma(tag, this.viewBox), grupo: 0, oculto: false });
    this.selecionar(this.elementos.length - 1);
  }

  // Apaga a forma indicada, ou a seleção (forma ou ícone inteiro)
  remover(indice = null) {
    if (this.arrastando) return;
    const indices =
      indice !== null
        ? [indice]
        : this.selecionado !== null
          ? this.alvos()
          : this.indicesDoGrupo(this.grupoSelecionado);
    if (!indices.length || !indices.every((i) => this.elementos[i])) return;
    this.registrar();
    const apagar = new Set(indices);
    this.elementos = this.elementos.filter((_, i) => !apagar.has(i));
    this.limparSelecao();
  }

  // ── Copiar e colar (Ctrl+C / Ctrl+V) ─────────────────────────────────────
  // A cópia é da forma ou do ícone selecionado e continua valendo ao abrir
  // outro ícone. Devolve se havia o que copiar.
  copiar() {
    if (!this.temSelecao) return false;
    const indices = this.alvos();
    this.copiados = {
      elementos: indices.map((i) => structuredClone(this.elementos[i])),
      // Grupo inteiro: a cópia vira um grupo novo, com o mesmo nome
      grupo: this.selecionado === null ? this.grupos[this.grupoSelecionado] : null,
    };
    this.colagens = 0;
    return true;
  }

  get temCopia() {
    return Boolean(this.copiados?.elementos.length);
  }

  // Cada colagem fica um pouco mais para baixo e para a direita, para não
  // cair exatamente em cima da original. Devolve se colou.
  colar() {
    if (!this.temCopia) return false;
    this.registrar();
    this.colagens++;
    const desvio = (this.passo || 1) * 2 * this.colagens;
    const m = matrizes.mover(desvio, desvio);
    const { grupo: origem } = this.copiados;
    const grupoNovo = origem ? this.grupos.push({ ...origem }) - 1 : null;
    const inicio = this.elementos.length;
    for (const el of this.copiados.elementos) {
      const copia = structuredClone(el);
      // Uma forma copiada de dentro de um grupo fica solta
      const grupo = grupoNovo ?? 0;
      // Forma que só existe no código (html, path ilegível): cola no lugar
      let forma = copia;
      try {
        if (!copia.html) forma = transformarElemento(copia, m);
      } catch {}
      this.elementos.push({ ...forma, grupo, oculto: false });
    }
    if (grupoNovo !== null) this.selecionarGrupo(grupoNovo);
    else this.definirSelecao(this.elementos.map((_, i) => i).slice(inicio));
    return true;
  }

  alternarOculto(indice) {
    const el = this.elementos[indice];
    if (!el) return;
    this.registrar();
    el.oculto = !el.oculto;
  }

  // Giro, espelho, deslocamento e escala: na forma ou ícone selecionado (em
  // volta do centro dele) ou, sem seleção, no desenho inteiro. Devolve
  // quantos elementos não puderam mudar (os que só existem no código).
  // vezes: quantos passos da grade o deslocamento anda (Shift+seta = 10)
  transformar(operacao, { vezes = 1 } = {}) {
    if (this.arrastando) return 0;
    const alvos = this.alvos();
    const { cx, cy } = this.temSelecao ? this.centroDe(alvos) : this.centro;
    const passo = (this.passo || 1) * vezes;
    const m = {
      girar: () => matrizes.girar90(cx, cy),
      girar45: () => matrizes.girar(45, cx, cy),
      espelharH: () => matrizes.espelharH(cx),
      espelharV: () => matrizes.espelharV(cy),
      esquerda: () => matrizes.mover(-passo, 0),
      direita: () => matrizes.mover(passo, 0),
      cima: () => matrizes.mover(0, -passo),
      baixo: () => matrizes.mover(0, passo),
      diminuir: () => matrizes.escalar(0.9, cx, cy),
      aumentar: () => matrizes.escalar(1 / 0.9, cx, cy),
    }[operacao]?.();
    if (!m) return 0;

    const fixos = alvos.filter((i) => !this.editavel(i)).length;
    if (fixos === alvos.length) return fixos;
    this.registrar();
    for (const i of alvos)
      if (this.editavel(i)) this.elementos[i] = transformarElemento(this.elementos[i], m);
    return fixos;
  }

  // ── Duplicar (Ctrl+D) ────────────────────────────────────────────────────
  // Uma cópia da seleção logo ao lado, já selecionada, sem mexer no que foi
  // copiado com Ctrl+C. Devolve se duplicou.
  duplicar() {
    if (!this.temSelecao || this.arrastando) return false;
    const guardados = [this.copiados, this.colagens];
    this.copiar();
    this.colar();
    [this.copiados, this.colagens] = guardados;
    return true;
  }

  // ── Alinhar e distribuir ─────────────────────────────────────────────────
  // Unidades da seleção: um grupo inteiro anda junto; as outras formas, cada
  // uma por si. Sem seleção, o desenho todo é uma unidade.
  unidadesDaSelecao() {
    const alvos = this.alvos().filter((i) => this.editavel(i));
    if (!this.temSelecao || this.grupoSelecionado !== null) return alvos.length ? [alvos] : [];
    const marcadas = new Set(alvos);
    const unidades = [];
    const vistas = new Set();
    for (const i of alvos) {
      if (vistas.has(i)) continue;
      const bloco = this.blocoDe(i).filter((k) => this.editavel(k));
      const unidade = bloco.every((k) => marcadas.has(k)) ? bloco : [i];
      unidade.forEach((k) => vistas.add(k));
      unidades.push(unidade);
    }
    return unidades;
  }

  // operacao: esquerda, centroH, direita, topo, centroV, base (alinha), ou
  // distribuirH, distribuirV (mesmo espaço entre as unidades, com 3 ou mais).
  // Com uma unidade só, ela se alinha à área do ícone (centroH + centroV
  // centralizam). Devolve se algo mudou.
  alinhar(operacao) {
    if (this.arrastando) return false;
    const unidades = this.unidadesDaSelecao()
      .map((indices) => ({ indices, caixa: this.limitesDe(indices) }))
      .filter((u) => u.caixa);
    if (!unidades.length) return false;
    const { x, y, w, h } = this.viewBox;
    const area = unidades.length > 1
      ? this.limitesDe(unidades.flatMap((u) => u.indices))
      : { minX: x, minY: y, maxX: x + w, maxY: y + h };
    const desvios = new Map();
    if (operacao === "distribuirH" || operacao === "distribuirV") {
      if (unidades.length < 3) return false;
      const [ini, fim] = operacao === "distribuirH" ? ["minX", "maxX"] : ["minY", "maxY"];
      const ordem = [...unidades].sort((a, b) => a.caixa[ini] + a.caixa[fim] - (b.caixa[ini] + b.caixa[fim]));
      const ocupado = ordem.reduce((soma, u) => soma + u.caixa[fim] - u.caixa[ini], 0);
      const vao = (ordem.at(-1).caixa[fim] - ordem[0].caixa[ini] - ocupado) / (ordem.length - 1);
      let pos = ordem[0].caixa[ini];
      for (const u of ordem) {
        const d = pos - u.caixa[ini];
        desvios.set(u, operacao === "distribuirH" ? [d, 0] : [0, d]);
        pos += u.caixa[fim] - u.caixa[ini] + vao;
      }
    } else {
      const alvo = {
        esquerda: (c) => [area.minX - c.minX, 0],
        direita: (c) => [area.maxX - c.maxX, 0],
        centroH: (c) => [(area.minX + area.maxX - c.minX - c.maxX) / 2, 0],
        topo: (c) => [0, area.minY - c.minY],
        base: (c) => [0, area.maxY - c.maxY],
        centroV: (c) => [0, (area.minY + area.maxY - c.minY - c.maxY) / 2],
      }[operacao];
      if (!alvo) return false;
      for (const u of unidades) desvios.set(u, alvo(u.caixa));
    }
    const mudam = [...desvios].filter(([, [dx, dy]]) => Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9);
    if (!mudam.length) return false;
    this.registrar();
    for (const [u, [dx, dy]] of mudam) {
      const m = matrizes.mover(dx, dy);
      for (const i of u.indices) this.elementos[i] = transformarElemento(this.elementos[i], m);
    }
    return true;
  }

  // ── Posição e tamanho exatos ─────────────────────────────────────────────
  // Caixa da seleção (ou do desenho todo): { x, y, w, h }, ou null
  caixaDaSelecao() {
    const c = this.limitesDe(this.alvos());
    return c ? { x: c.minX, y: c.minY, w: c.maxX - c.minX, h: c.maxY - c.minY } : null;
  }

  // Muda x, y, w ou h da caixa. O tamanho muda na proporção (assim círculos
  // e arcos continuam certos), a partir do canto de cima à esquerda.
  definirCaixa({ x, y, w, h }) {
    const c = this.caixaDaSelecao();
    if (!c || this.arrastando) return false;
    let m;
    if (x !== undefined || y !== undefined) m = matrizes.mover((x ?? c.x) - c.x, (y ?? c.y) - c.y);
    else {
      const k = w !== undefined ? (c.w ? w / c.w : 0) : c.h ? h / c.h : 0;
      if (!(k > 0) || !Number.isFinite(k)) return false;
      m = matrizes.escalar(k, c.x, c.y);
    }
    if (m.a === 1 && m.d === 1 && !m.e && !m.f) return false;
    this.registrar();
    for (const i of this.alvos())
      if (this.editavel(i)) this.elementos[i] = transformarElemento(this.elementos[i], m);
    return true;
  }

  // Durante um arraste: aplica a matriz às formas como estavam no início
  // (as alças da caixa de seleção mudam o tamanho e giram por aqui)
  arrastarComMatriz(m) {
    if (!this.base) return;
    for (const [i, el] of this.base) this.elementos[i] = transformarElemento(el, m);
  }

  // ── Pontas e cantos do traço ─────────────────────────────────────────────
  // atributo: stroke-linecap (round, butt, square) ou stroke-linejoin
  // (round, miter, bevel). Só nas formas com traço. Devolve se mudou.
  definirAtributoDoTraco(atributo, valor) {
    if (!this.temSelecao || !["stroke-linecap", "stroke-linejoin"].includes(atributo)) return false;
    const herdado = this.raiz[atributo] ?? PADRAO_DESENHO[atributo];
    const mudar = this.alvos().filter((i) => {
      const el = this.elementos[i];
      return !el.html && this.efetivo(el, "stroke") !== "none" && this.efetivo(el, atributo) !== valor;
    });
    if (!mudar.length) return false;
    this.registrar();
    for (const i of mudar) {
      const attrs = { ...this.elementos[i].attrs };
      if (valor === herdado) delete attrs[atributo];
      else attrs[atributo] = valor;
      this.elementos[i] = { ...this.elementos[i], attrs };
    }
    return true;
  }

  // ── Otimizar o SVG ───────────────────────────────────────────────────────
  // Tira o que não muda o desenho: atributos vazios, data-*, version e
  // xml:space, atributos de desenho iguais ao que a forma já herda, e
  // reescreve os paths que ficam menores. Devolve quantos bytes o SVG perdeu
  // (0 = nada a fazer, sem passo no histórico).
  otimizar() {
    if (this.arrastando) return 0;
    const inutil = (nome, valor) => valor === "" || /^data-/.test(nome) || nome === "version" || nome === "xml:space";
    const limpar = (attrs, herdar) => {
      const novo = {};
      for (const [nome, valor] of Object.entries(attrs)) {
        if (inutil(nome, valor)) continue;
        if (herdar && nome in PADRAO_DESENHO && valor === (this.raiz[nome] ?? PADRAO_DESENHO[nome])) continue;
        novo[nome] = valor;
      }
      return novo;
    };
    const antes = this.svg().length;
    const estado = this.instantaneo();
    const [raizAntes, elementosAntes] = [this.raiz, this.elementos];
    this.raiz = limpar(this.raiz, false);
    this.elementos = elementosAntes.map((el, i) => {
      if (el.html) return el;
      const attrs = limpar(el.attrs, true);
      if (el.tag === "path" && this.editavel(i)) {
        const curto = escreverPath(lerPath(attrs.d ?? ""));
        if (curto.length < (attrs.d ?? "").length) attrs.d = curto;
      }
      return { ...el, attrs };
    });
    const ganho = antes - this.svg().length;
    if (ganho <= 0) {
      [this.raiz, this.elementos] = [raizAntes, elementosAntes];
      return 0;
    }
    this.historico.push(estado);
    if (this.historico.length > LIMITE_HISTORICO) this.historico.shift();
    this.refazer = [];
    return ganho;
  }

  // ── Outro ícone por cima ─────────────────────────────────────────────────
  // Acrescenta as formas de outro ícone num grupo novo. Ele é ajustado à
  // grade deste (um Bootstrap 16×16 cabe num Lucide 24×24) e cada forma leva
  // o estilo do ícone de origem — traço ou preenchimento, espessura, pontas —
  // para continuar com a mesma cara. Devolve quantas formas não puderam ser
  // ajustadas (as que só existem no código).
  importarDocumento(doc, nome) {
    const destino = this.viewBox;
    const origem = viewBoxDe(doc.raiz);
    const k = Math.min(destino.w / origem.w, destino.h / origem.h);
    // Proporções diferentes: centraliza
    const m = {
      a: k, b: 0, c: 0, d: k,
      e: destino.x + (destino.w - origem.w * k) / 2 - origem.x * k,
      f: destino.y + (destino.h - origem.h * k) / 2 - origem.y * k,
    };
    const identidade = k === 1 && m.e === 0 && m.f === 0;
    const herdado = (atributo) => doc.raiz[atributo] ?? PADRAO_DESENHO[atributo];
    const daqui = (atributo) => this.raiz[atributo] ?? PADRAO_DESENHO[atributo];

    this.registrar();
    const grupo = this.grupos.push({ nome }) - 1;
    let fixos = 0;
    for (const el of this.semIdsRepetidos(doc.elementos)) {
      if (el.html) {
        if (!identidade) fixos++;
        this.elementos.push({ ...el, grupo, oculto: false });
        continue;
      }
      const attrs = { ...el.attrs };
      const levar = (atributo) => {
        if (attrs[atributo] === undefined && herdado(atributo) !== daqui(atributo))
          attrs[atributo] = herdado(atributo);
      };
      levar("fill");
      levar("stroke");
      const traco = attrs.stroke ?? daqui("stroke");
      for (const atributo of Object.keys(PADRAO_DESENHO)) {
        if (atributo === "fill" || atributo === "stroke" || atributo === "stroke-width") continue;
        // Pontas, cantos e afins só importam em formas com traço
        if (atributo.startsWith("stroke-") && traco === "none") continue;
        levar(atributo);
      }
      // A espessura acompanha a escala, para o traço ter a mesma grossura
      // relativa que tinha no ícone de origem
      if (traco !== "none") {
        const largura = fmt(parseFloat(attrs["stroke-width"] ?? herdado("stroke-width")) * k);
        if (largura === fmt(parseFloat(daqui("stroke-width")))) delete attrs["stroke-width"];
        else attrs["stroke-width"] = largura;
      }
      const forma = identidade ? { tag: el.tag, attrs } : transformarElemento({ tag: el.tag, attrs }, m);
      this.elementos.push({ ...forma, grupo, oculto: false });
    }
    this.selecionarGrupo(grupo);
    return fixos;
  }

  importar(texto, nome) {
    return this.importarDocumento(lerSvg(texto), nome);
  }

  // Os elementos de um ícone que chega, com outro nome para cada id que já
  // existe aqui: dois ícones da Iconlibrary trazem "il-grad-1", e no mesmo
  // SVG o segundo pintaria com o degradê do primeiro. Um degradê do editor
  // ganha o próximo il-grad-N livre (continua editável); outro id, um sufixo.
  // As referências (url(#…), href="#…") acompanham.
  semIdsRepetidos(elementos) {
    const idsDe = (lista) => lista.flatMap((el) => [...(el.html ?? "").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const aqui = new Set(idsDe(this.elementos));
    const chegando = idsDe(elementos);
    const ocupados = new Set([...aqui, ...chegando]);
    let maior = Math.max(0, ...[...ocupados].map((id) => Number(/^il-grad-(\d+)$/.exec(id)?.[1] ?? 0)));
    const troca = new Map();
    for (const id of chegando) {
      if (!aqui.has(id) || troca.has(id)) continue;
      let novo;
      if (/^il-grad-\d+$/.test(id)) novo = `il-grad-${++maior}`;
      else for (let n = 2; ocupados.has((novo = `${id}-${n}`)); n++);
      ocupados.add(novo);
      troca.set(id, novo);
    }
    if (!troca.size) return elementos;
    const trocar = (texto) =>
      String(texto)
        .replace(/(\sid=")([^"]+)"/g, (trecho, antes, id) => (troca.has(id) ? `${antes}${troca.get(id)}"` : trecho))
        .replace(/url\(\s*#([^)\s]+)\s*\)/g, (trecho, id) => (troca.has(id) ? `url(#${troca.get(id)})` : trecho))
        .replace(/(href=")#([^"]+)"/g, (trecho, antes, id) => (troca.has(id) ? `${antes}#${troca.get(id)}"` : trecho));
    return elementos.map((el) =>
      el.html
        ? { ...el, html: trocar(el.html) }
        : { ...el, attrs: Object.fromEntries(Object.entries(el.attrs).map(([k, v]) => [k, /url\(/.test(v) ? trocar(v) : v])) },
    );
  }

  // ── Arquivo .ile ─────────────────────────────────────────────────────────
  // O projeto como objeto, pronto para JSON.stringify
  exportarProjeto({ nome, editavel = false }) {
    return {
      formato: FORMATO_ILE,
      versao: VERSAO_ILE,
      nome,
      editavel,
      salvo: new Date().toISOString(),
      raiz: this.raiz,
      grupos: this.grupos,
      elementos: this.elementos.map(({ tag, attrs, html, grupo, oculto }) =>
        html !== undefined ? { tag, html, grupo, oculto } : { tag, attrs, grupo, oculto },
      ),
    };
  }

  // Texto de um .ile → projeto no editor. Todo o conteúdo é remontado como
  // SVG e passa por lerSvg, a mesma limpeza do código colado. Com
  // desfazivel, abrir vira um passo do histórico (o trabalho anterior volta
  // com Undo); sem, o histórico começa do zero.
  carregarProjeto(textoDoArquivo, { desfazivel = false } = {}) {
    let dados;
    try {
      dados = JSON.parse(textoDoArquivo);
    } catch {
      throw erroCom("error.ileInvalid", "Not a valid .ile file: it is not JSON text", {
        reason: erroCom("ile.notJson", "it is not JSON text"),
      });
    }
    const projeto = validarProjeto(dados);
    // Inclui as formas ocultas, que svg() deixaria de fora
    const filhos = projeto.elementos
      .map((el) => (el.html !== undefined ? el.html : `<${el.tag}${atributos(el.attrs)}/>`))
      .join("");
    const { xmlns: _xmlns, ...raizSemNs } = projeto.raiz;
    const doc = lerSvg(`<svg xmlns="http://www.w3.org/2000/svg"${atributos(raizSemNs)}>${filhos}</svg>`);
    // A limpeza pode ter removido elementos (um <script>, por exemplo): sem
    // a correspondência um a um, as formas vão todas para o primeiro ícone
    const alinhado = doc.elementos.length === projeto.elementos.length;
    const raiz = { ...doc.raiz };
    if (!projeto.raiz.xmlns) delete raiz.xmlns;

    if (desfazivel) this.registrar();
    else {
      this.historico = [];
      this.refazer = [];
    }
    this.raiz = raiz;
    this.grupos = projeto.grupos;
    this.elementos = doc.elementos.map((el, i) => ({
      ...el,
      grupo: alinhado ? projeto.elementos[i].grupo : 0,
      oculto: alinhado ? projeto.elementos[i].oculto : false,
    }));
    this.limparSelecao();
    this.original = this.svg();
    return { nome: projeto.nome, editavel: projeto.editavel };
  }

  // ── Cor e espessura por forma ────────────────────────────────────────────
  // Valem para a forma ou o ícone selecionado. Cor nula volta à cor do texto
  // (currentColor). Formas sem traço não ganham traço, e formas sem
  // preenchimento não ganham preenchimento.
  definirCor(cor, { registrar = true } = {}) {
    if (!this.temSelecao) return;
    if (registrar) this.registrar();
    const valor = cor ?? "currentColor";
    for (const i of this.alvos()) {
      const el = this.elementos[i];
      if (el.html) continue;
      const attrs = { ...el.attrs };
      for (const atributo of ["stroke", "fill"]) {
        if (this.efetivo(el, atributo) === "none") continue;
        if (valor === (this.raiz[atributo] ?? PADRAO_DESENHO[atributo])) delete attrs[atributo];
        else attrs[atributo] = valor;
      }
      this.elementos[i] = { ...el, attrs };
    }
  }

  definirTraco(largura, { registrar = true } = {}) {
    if (!this.temSelecao) return;
    if (registrar) this.registrar();
    const valor = fmt(largura);
    for (const i of this.alvos()) {
      const el = this.elementos[i];
      if (el.html || this.efetivo(el, "stroke") === "none") continue;
      const attrs = { ...el.attrs };
      if (valor === fmt(parseFloat(this.raiz["stroke-width"] ?? PADRAO_DESENHO["stroke-width"])))
        delete attrs["stroke-width"];
      else attrs["stroke-width"] = valor;
      this.elementos[i] = { ...el, attrs };
    }
  }

  // ── Preenchimento ────────────────────────────────────────────────────────
  // Só nas formas fechadas da seleção
  formasPreenchiveis() {
    if (!this.temSelecao) return [];
    return this.alvos().filter((i) => this.elementos[i] && !this.elementos[i].html && formaFechada(this.elementos[i]));
  }

  get podePreencher() {
    return this.formasPreenchiveis().length > 0;
  }

  get preenchida() {
    const formas = this.formasPreenchiveis();
    return formas.length > 0 && formas.every((i) => this.efetivo(this.elementos[i], "fill") !== "none");
  }

  // Liga ou desliga, em todas juntas. O preenchimento usa a cor do traço. Ao
  // desligar numa forma sem traço (as do Bootstrap), o traço assume a cor dela,
  // porque sem os dois a forma sumiria. Devolve se mudou.
  alternarPreenchimento() {
    const formas = this.formasPreenchiveis();
    if (!formas.length) return false;
    const preencher = !this.preenchida;
    this.registrar();
    for (const i of formas) {
      const el = this.elementos[i];
      const attrs = { ...el.attrs };
      const traco = this.efetivo(el, "stroke");
      const fundo = this.efetivo(el, "fill");
      if (preencher) {
        const cor = traco === "none" ? "currentColor" : traco;
        if (cor === this.raiz.fill) delete attrs.fill;
        else attrs.fill = cor;
      } else {
        if (traco === "none") attrs.stroke = fundo;
        if ((this.raiz.fill ?? PADRAO_DESENHO.fill) === "none") delete attrs.fill;
        else attrs.fill = "none";
      }
      this.elementos[i] = { ...el, attrs };
    }
    return true;
  }

  // Cor e espessura atuais da seleção, para os controles: { cor, traco }.
  // cor: null = cor do texto; traco: null = a seleção não tem traço
  estiloDaSelecao() {
    const el = this.alvos().map((i) => this.elementos[i]).find((e) => e && !e.html);
    if (!this.temSelecao || !el) return null;
    const temTraco = this.efetivo(el, "stroke") !== "none";
    let cor = temTraco ? this.efetivo(el, "stroke") : this.efetivo(el, "fill");
    // Num degradê, o seletor de cor mostra a primeira cor dele
    if (idDoDegrade(cor)) cor = this.degradePorId(idDoDegrade(cor))?.cores[0] ?? null;
    return {
      cor: cor === "currentColor" || cor === "none" ? null : cor,
      traco: temTraco ? parseFloat(this.efetivo(el, "stroke-width")) : null,
      pontas: temTraco ? this.efetivo(el, "stroke-linecap") : null,
      cantos: temTraco ? this.efetivo(el, "stroke-linejoin") : null,
    };
  }

  // ── Unir, Subtrair, Interseção, Excluir ──────────────────────────────────
  // Só formas fechadas, sem transform. Unir aceita duas ou mais; as outras,
  // exatamente duas: a de baixo (primeira no desenho) e a de cima.
  formasParaCombinar() {
    if (!this.temSelecao) return [];
    return this.alvos()
      .filter((i) => {
        const el = this.elementos[i];
        return el && !el.html && !el.attrs.transform && formaFechada(el);
      })
      .sort((a, b) => a - b);
  }

  podeCombinarFormas(operacao) {
    if (!this.temSelecao) return false;
    const formas = this.formasParaCombinar();
    // Tudo o que está selecionado precisa servir
    if (formas.length !== this.alvos().length) return false;
    return operacao === "unir" ? formas.length >= 2 : formas.length === 2;
  }

  // Em duas etapas, porque a conta roda num Web Worker (assíncrona):
  // prepararCombinacao → { operacao, indices, originais, caminhos } ou null;
  // aplicarCombinacao(pedido, d) → { ok } ou { ok: false, motivo }: "selecao"
  // (a seleção não serve ou as formas mudaram durante a conta) ou "vazio" (não
  // sobra nada). O resultado fica no lugar da forma de baixo, com o estilo
  // dela; as outras saem.
  prepararCombinacao(operacao) {
    if (!this.podeCombinarFormas(operacao)) return null;
    const indices = this.formasParaCombinar();
    const caminhos = indices.map((i) => caminhoDaForma(this.elementos[i]));
    if (caminhos.some((d) => !d)) return null;
    return { operacao, indices, originais: indices.map((i) => this.elementos[i]), caminhos };
  }

  aplicarCombinacao(pedido, resultado) {
    // As formas trocam de objeto a cada mudança: se alguma não é mais a
    // mesma (editada, apagada, desfeita), o resultado é de outra versão
    if (!pedido || pedido.indices.some((i, k) => this.elementos[i] !== pedido.originais[k]))
      return { ok: false, motivo: "selecao" };
    let d;
    try {
      // Mesma escrita dos outros paths do editor (absoluto, 3 casas)
      d = escreverPath(lerPath(resultado || ""));
    } catch {
      return { ok: false, motivo: "vazio" };
    }
    if (!/\d/.test(d)) return { ok: false, motivo: "vazio" };
    const { indices } = pedido;
    this.registrar();
    const base = this.elementos[indices[0]];
    const attrs = {};
    for (const [nome, valor] of Object.entries(base.attrs))
      if (!GEOMETRIA.has(nome)) attrs[nome] = valor;
    attrs.d = d;
    // Com furos ou partes separadas, evenodd desenha certo em qualquer sentido
    if ((d.match(/M/g) || []).length > 1) attrs["fill-rule"] = "evenodd";
    const saem = new Set(indices.slice(1));
    const elementos = [];
    let novo = -1;
    this.elementos.forEach((el, i) => {
      if (i === indices[0]) {
        novo = elementos.length;
        elementos.push({ ...base, tag: "path", attrs });
      } else if (!saem.has(i)) elementos.push(el);
    });
    this.elementos = elementos;
    this.definirSelecao([novo]);
    return { ok: true };
  }

  // As duas etapas de uma vez, com a conta síncrona (testes):
  // motor(operacao, caminhos) → texto do path resultante
  combinarFormas(operacao, motor) {
    const pedido = this.prepararCombinacao(operacao);
    if (!pedido) return { ok: false, motivo: "selecao" };
    let resultado;
    try {
      resultado = motor(operacao, pedido.caminhos);
    } catch {
      return { ok: false, motivo: "vazio" };
    }
    return this.aplicarCombinacao(pedido, resultado);
  }

  // ── Degradê ──────────────────────────────────────────────────────────────
  // alvo "fill": só formas fechadas (o preenchimento liga junto); alvo
  // "stroke": formas com traço. Veja models/degrade.js.
  idDoElemento(el) {
    return /\bid="([^"]*)"/.exec(el.html ?? "")?.[1] ?? null;
  }

  degradePorId(id) {
    const el = this.elementos.find((e) => ehDegrade(e) && this.idDoElemento(e) === id);
    return el ? lerDegrade(el.html) : null;
  }

  // ids usados por formas visíveis
  degradesEmUso() {
    const ids = new Set();
    for (const el of this.elementos)
      if (!el.html && !el.oculto)
        for (const a of ["fill", "stroke"]) {
          const id = idDoDegrade(el.attrs[a]);
          if (id) ids.add(id);
        }
    return ids;
  }

  formasParaDegrade(alvo) {
    if (!this.temSelecao) return [];
    return this.alvos().filter((i) => {
      const el = this.elementos[i];
      if (!el || el.html) return false;
      return alvo === "fill" ? formaFechada(el) : this.efetivo(el, "stroke") !== "none";
    });
  }

  podeDegrade(alvo) {
    return this.formasParaDegrade(alvo).length > 0;
  }

  // O degradê da seleção, para os controles: { tipo, cores, angulo, alvo }
  degradeDaSelecao() {
    if (!this.temSelecao) return null;
    for (const i of this.alvos()) {
      const el = this.elementos[i];
      if (!el || el.html) continue;
      for (const alvo of ["fill", "stroke"]) {
        const id = idDoDegrade(el.attrs[alvo]);
        const d = id && this.degradePorId(id);
        if (d) return { ...d, alvo };
      }
    }
    return null;
  }

  // Aplica nas formas da seleção um degradê só, que cobre todas juntas.
  // Devolve se mudou.
  aplicarDegrade({ tipo, cores, angulo, alvo = "fill" } = {}) {
    const pedido = normalizarDegrade({ tipo, cores, angulo });
    if (!pedido || !["fill", "stroke"].includes(alvo)) return false;
    const formas = this.formasParaDegrade(alvo);
    const caixa = this.limitesDe(formas);
    if (!formas.length || !caixa) return false;
    this.registrar();
    // Um id novo; o elemento de um degradê que ficou sem uso é reaproveitado
    const ids = this.elementos.filter(ehDegrade).map((e) => Number(this.idDoElemento(e).slice(8)));
    const id = `il-grad-${(ids.length ? Math.max(...ids) : 0) + 1}`;
    for (const i of formas) {
      const el = this.elementos[i];
      this.elementos[i] = { ...el, attrs: { ...el.attrs, [alvo]: `url(#${id})` } };
    }
    const novo = { tag: tipo === "radial" ? "radialGradient" : "linearGradient", html: montarDegrade(id, pedido, caixa), grupo: 0, oculto: false };
    const usados = this.degradesEmUso();
    const livre = this.elementos.findIndex((e) => ehDegrade(e) && !usados.has(this.idDoElemento(e)));
    if (livre >= 0) this.elementos[livre] = novo;
    else this.elementos.push(novo);
    return true;
  }

  // Tira o degradê da seleção: cada forma fica com a primeira cor dele.
  // Devolve se mudou.
  removerDegrade() {
    if (!this.temSelecao) return false;
    const trocas = [];
    for (const i of this.alvos()) {
      const el = this.elementos[i];
      if (!el || el.html) continue;
      for (const a of ["fill", "stroke"]) {
        const id = idDoDegrade(el.attrs[a]);
        if (id) trocas.push([i, a, this.degradePorId(id)?.cores[0] ?? "currentColor"]);
      }
    }
    if (!trocas.length) return false;
    this.registrar();
    for (const [i, a, cor] of trocas) {
      const el = this.elementos[i];
      this.elementos[i] = { ...el, attrs: { ...el.attrs, [a]: cor } };
    }
    return true;
  }

  // Refaz as coordenadas de cada degradê a partir da caixa das formas que o
  // usam agora (depois de mover, girar, redimensionar…). Não é um passo do
  // histórico: é derivado das formas.
  ajustarDegrades() {
    this.elementos.forEach((el, i) => {
      if (!ehDegrade(el)) return;
      const id = this.idDoElemento(el);
      const formas = this.elementos.flatMap((f, j) =>
        !f.html && !f.oculto && ["fill", "stroke"].some((a) => idDoDegrade(f.attrs[a]) === id) ? [j] : [],
      );
      const caixa = formas.length ? this.limitesDe(formas) : null;
      const pedido = caixa && lerDegrade(el.html);
      if (!pedido) return;
      const html = montarDegrade(id, pedido, caixa);
      if (html !== el.html) this.elementos[i] = { ...el, html };
    });
  }

  // Mais de um ícone (agrupar formas não conta) ou formas com cor própria: o Lucide Studio, que trabalha
  // com o estilo de um ícone só, deixa de ser opção
  get misturado() {
    const icones = this.elementos.filter((el) => !this.grupos[el.grupo]?.manual);
    if (new Set(icones.map((el) => el.grupo)).size > 1) return true;
    return this.elementos.some(
      (el) =>
        !el.html &&
        ["stroke", "fill"].some((a) => {
          const v = el.attrs[a];
          return v !== undefined && v !== "none" && v !== "currentColor";
        }),
    );
  }
}
