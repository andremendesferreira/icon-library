import {
  FORMAS,
  fmt,
  lerPath,
  limitesDoElemento,
  matrizes,
  moverPonto,
  novaForma,
  pontosDoElemento,
  transformarElemento,
} from "./svgGeometry.js";
import { erro as erroCom } from "./erros.js";

const LIMITE_HISTORICO = 100;

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
  // Nada que execute código: atributos de evento (onload, onclick…), links
  // javascript:, <script> e <foreignObject> (que embute HTML). A prévia
  // mostra o código como HTML de verdade, o código pode ter sido colado e um
  // arquivo .ile pode ter vindo de outra pessoa — e um ícone não precisa
  // de nada disso.
  for (const no of [raiz, ...raiz.querySelectorAll("*")])
    for (const at of [...no.attributes])
      if (
        /^on/i.test(at.name) ||
        (/(^|:)href$/i.test(at.name) && /^\s*javascript:/i.test(at.value))
      )
        no.removeAttribute(at.name);
  for (const perigoso of raiz.querySelectorAll("script, foreignObject")) perigoso.remove();
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
    grupos: grupos.map((g) => ({ nome: g.nome })),
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
  // Um grupo por ícone: [{ nome }]. O primeiro é o ícone aberto.
  grupos = [];
  // Seleção: uma forma (selecionado) ou um ícone inteiro (grupoSelecionado)
  selecionado = null;
  grupoSelecionado = null;
  // Encaixe na grade, em unidades do ícone (0 = livre)
  passo = 0.5;
  historico = [];
  refazer = [];
  // Cópia dos elementos no início de um arraste: cada movimento parte dela,
  // sem acumular arredondamentos
  base = null;
  // Copiar e colar: { elementos, nome } e quantas vezes já foi colado
  copiados = null;
  colagens = 0;

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
    this.registrar();
    // O código não guarda a que ícone cada forma pertence: as formas mantêm
    // o grupo pela posição, e as novas ficam no primeiro
    const anteriores = this.elementos;
    this.raiz = doc.raiz;
    this.elementos = doc.elementos.map((el, i) => ({
      ...el,
      grupo: anteriores[i]?.grupo ?? 0,
      oculto: false,
    }));
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
  svg() {
    const filhos = this.elementos
      .filter((el) => !el.oculto)
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
    if (!this.indicesDoGrupo(this.grupoSelecionado).length)
      this.grupoSelecionado = null;
  }

  get podeDesfazer() {
    return this.historico.length > 0;
  }

  get podeRefazer() {
    return this.refazer.length > 0;
  }

  desfazer() {
    if (!this.podeDesfazer) return;
    this.refazer.push(this.instantaneo());
    this.restaurar(this.historico.pop());
  }

  refazerUltimo() {
    if (!this.podeRefazer) return;
    this.historico.push(this.instantaneo());
    this.restaurar(this.refazer.pop());
  }

  // ── Seleção ──────────────────────────────────────────────────────────────
  limparSelecao() {
    this.selecionado = null;
    this.grupoSelecionado = null;
  }

  selecionar(indice) {
    this.grupoSelecionado = null;
    this.selecionado =
      indice !== null && this.elementos[indice] ? indice : null;
  }

  selecionarGrupo(grupo) {
    this.selecionado = null;
    this.grupoSelecionado = this.indicesDoGrupo(grupo).length ? grupo : null;
  }

  // Clique numa forma: se ela é parte do ícone selecionado, a seleção do
  // ícone continua (para arrastá-lo inteiro); senão, seleciona a forma
  clicarForma(indice) {
    const el = this.elementos[indice];
    if (this.grupoSelecionado !== null && el?.grupo === this.grupoSelecionado) return;
    this.selecionar(indice);
  }

  indicesDoGrupo(grupo) {
    if (grupo === null) return [];
    return this.elementos.flatMap((el, i) => (el.grupo === grupo ? [i] : []));
  }

  // Ícones com formas, na ordem: [{ grupo, nome, indices }]
  gruposEmUso() {
    return this.grupos
      .map((g, grupo) => ({ grupo, nome: g.nome, indices: this.indicesDoGrupo(grupo) }))
      .filter((g) => g.indices.length);
  }

  get temSelecao() {
    return this.selecionado !== null || this.grupoSelecionado !== null;
  }

  // Alvo das ações: a forma, o ícone selecionado ou, sem seleção, tudo
  alvos() {
    if (this.selecionado !== null) return [this.selecionado];
    if (this.grupoSelecionado !== null) return this.indicesDoGrupo(this.grupoSelecionado);
    return this.elementos.map((_, i) => i);
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
    if (this.selecionado === null || !this.editavel(this.selecionado)) return [];
    return pontosDoElemento(this.elementos[this.selecionado]);
  }

  // Centro dos pontos das formas, encaixado em meia unidade — girar e
  // espelhar em volta dele mantém os pontos na grade
  centroDe(indices) {
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
    if (minX === Infinity) return this.centro;
    const meio = (v) => Math.round(v * 2) / 2;
    return { cx: meio((minX + maxX) / 2), cy: meio((minY + maxY) / 2) };
  }

  // ── Arraste: iniciar → mover (quantas vezes for) → terminar ──────────────
  iniciarArraste() {
    if (!this.temSelecao) return false;
    const indices = this.alvos().filter((i) => this.editavel(i));
    if (!indices.length) return false;
    this.registrar();
    this.base = new Map(indices.map((i) => [i, this.elementos[i]]));
    return true;
  }

  arrastarPonto(id, x, y) {
    if (!this.base || this.selecionado === null) return;
    this.elementos[this.selecionado] = moverPonto(
      this.base.get(this.selecionado),
      id,
      this.encaixar(x),
      this.encaixar(y),
    );
  }

  arrastarElemento(dx, dy) {
    if (!this.base) return;
    const m = matrizes.mover(this.encaixar(dx), this.encaixar(dy));
    for (const [i, el] of this.base) this.elementos[i] = transformarElemento(el, m);
  }

  terminarArraste() {
    // Um clique sem movimento não deixa passo vazio no histórico
    if (this.base && [...this.base].every(([i, el]) => this.elementos[i] === el))
      this.historico.pop();
    this.base = null;
  }

  // ── Elementos ────────────────────────────────────────────────────────────
  adicionar(tag) {
    this.registrar();
    this.elementos.push({ ...novaForma(tag, this.viewBox), grupo: 0, oculto: false });
    this.selecionar(this.elementos.length - 1);
  }

  // Apaga a forma indicada, ou a seleção (forma ou ícone inteiro)
  remover(indice = null) {
    const indices =
      indice !== null
        ? [indice]
        : this.selecionado !== null
          ? [this.selecionado]
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
      // Ícone inteiro: a cópia vira um ícone novo, com o mesmo nome
      nome: this.selecionado === null ? this.grupos[this.grupoSelecionado]?.nome : null,
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
    const { nome } = this.copiados;
    const grupoNovo = nome != null ? this.grupos.push({ nome }) - 1 : null;
    const inicio = this.elementos.length;
    for (const el of this.copiados.elementos) {
      const copia = structuredClone(el);
      const grupo = grupoNovo ?? (this.grupos[copia.grupo] ? copia.grupo : 0);
      // Forma que só existe no código (html, path ilegível): cola no lugar
      let forma = copia;
      try {
        if (!copia.html) forma = transformarElemento(copia, m);
      } catch {}
      this.elementos.push({ ...forma, grupo, oculto: false });
    }
    if (grupoNovo !== null) this.selecionarGrupo(grupoNovo);
    else this.selecionar(inicio);
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
  transformar(operacao) {
    const alvos = this.alvos();
    const { cx, cy } = this.temSelecao ? this.centroDe(alvos) : this.centro;
    const passo = this.passo || 1;
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
    for (const el of doc.elementos) {
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

  // Cor e espessura atuais da seleção, para os controles: { cor, traco }.
  // cor: null = cor do texto; traco: null = a seleção não tem traço
  estiloDaSelecao() {
    const el = this.alvos().map((i) => this.elementos[i]).find((e) => e && !e.html);
    if (!this.temSelecao || !el) return null;
    const temTraco = this.efetivo(el, "stroke") !== "none";
    const cor = temTraco ? this.efetivo(el, "stroke") : this.efetivo(el, "fill");
    return {
      cor: cor === "currentColor" || cor === "none" ? null : cor,
      traco: temTraco ? parseFloat(this.efetivo(el, "stroke-width")) : null,
    };
  }

  // Mais de um ícone ou formas com cor própria: o Lucide Studio, que trabalha
  // com o estilo de um ícone só, deixa de ser opção
  get misturado() {
    if (new Set(this.elementos.map((el) => el.grupo)).size > 1) return true;
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
