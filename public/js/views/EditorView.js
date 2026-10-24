import { escapar } from "./html.js";
import { t } from "../i18n/i18n.js";

const NS = "http://www.w3.org/2000/svg";
const porId = (id) => document.getElementById(id);

// Atributos da tag <svg> que valem para o desenho dos filhos (traço, cor…);
// no editor eles vão para o <g> que contém o ícone
const ATRIBUTOS_DE_DESENHO = new Set([
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "fill-rule", "clip-rule", "opacity", "color",
]);

// Tamanho, em pixels de tela, dos pontos e da área de clique
const RAIO_PONTO = 6;
const LARGURA_CLIQUE = 14;

const PREVIAS = [16, 24, 32, 48];

// <input type="color"> só aceita #rrggbb: converte nomes e formatos curtos
// pelo próprio navegador. Nulo (cor do texto) devolve nulo.
let contextoCor;
function paraHex(cor) {
  if (!cor) return null;
  if (/^#[0-9a-f]{6}$/i.test(cor)) return cor.toLowerCase();
  contextoCor ??= document.createElement("canvas").getContext("2d");
  contextoCor.fillStyle = "#000000";
  contextoCor.fillStyle = cor;
  return /^#[0-9a-f]{6}$/i.test(contextoCor.fillStyle) ? contextoCor.fillStyle : null;
}

function criar(tag, attrs = {}) {
  const no = document.createElementNS(NS, tag);
  for (const [nome, valor] of Object.entries(attrs)) no.setAttribute(nome, valor);
  return no;
}

// Janela do editor. Desenha o estado que recebe e avisa o controller do que
// o usuário faz; não guarda o ícone nem decide nada.
export class EditorView {
  janela = porId("editor");
  nome = porId("editor-name");
  canvas = porId("editor-canvas");
  lista = porId("editor-elements");
  codigo = porId("editor-code");
  erro = porId("editor-error");
  previas = porId("editor-previews");
  encaixe = porId("editor-snap");
  botaoDesfazer = porId("editor-undo");
  botaoRefazer = porId("editor-redo");
  linkStudio = porId("editor-studio");
  // Cor e espessura da seleção
  painelEstilo = porId("editor-style");
  cor = porId("editor-color");
  corValor = porId("editor-color-value");
  campoTraco = porId("editor-stroke-field");
  traco = porId("editor-stroke");
  tracoValor = porId("editor-stroke-value");
  // Busca de outro ícone para pôr por cima
  botaoIcone = porId("editor-add-icon");
  busca = porId("editor-picker");
  buscaConjunto = porId("editor-picker-set");
  buscaTexto = porId("editor-picker-search");
  buscaResultados = porId("editor-picker-results");
  // Arquivo .ile: o mesmo seletor serve ao botão do editor e ao da página
  arquivo = porId("editor-file");
  arraste = null;
  acoes = null;

  constructor() {
    porId("editor-close").addEventListener("click", () => this.fechar());
    // Clique no fundo escuro (fora da caixa) fecha
    this.janela.addEventListener("click", (evento) => {
      if (evento.target === this.janela) this.fechar();
    });
  }

  get aberto() {
    return this.janela.open;
  }

  abrir(nome) {
    this.nome.textContent = nome;
    this.erro.textContent = "";
    this.mostrarPainelBusca(false);
    if (!this.janela.open) this.janela.showModal();
    this.canvas.focus({ preventScroll: true });
  }

  fechar() {
    if (!this.janela.open) return;
    this.janela.close();
    this.acoes?.aoFechar();
  }

  get textoCodigo() {
    return this.codigo.value;
  }

  // ── Ações do usuário ───────────────────────────────────────────────────────
  // acoes: { aoSelecionar, aoSelecionarGrupo, aoClicarForma, aoIniciarArraste,
  //   aoArrastarPonto, aoArrastarElemento, aoTerminarArraste, aoAdicionar,
  //   aoRemover, aoOcultar, aoTransformar, aoEncaixe, aoCodigo, aoDesfazer,
  //   aoRefazer, aoCor, aoTraco, aoAbrirBusca, aoBuscar, aoImportar, aoCopiar,
  //   aoBaixarSvg, aoBaixarPng, aoScratchpad, aoSalvarArquivo, aoAbrirArquivo }
  ligar(acoes) {
    this.acoes = acoes;
    this.ligarCanvas();
    this.ligarEstilo();
    this.ligarBusca();
    this.ligarArquivo();

    this.lista.addEventListener("click", (evento) => {
      const cabecalho = evento.target.closest("[data-grupo]");
      if (cabecalho) {
        acoes.aoSelecionarGrupo(Number(cabecalho.dataset.grupo));
        return;
      }
      const item = evento.target.closest("[data-i]");
      if (!item) return;
      const i = Number(item.dataset.i);
      const botao = evento.target.closest("[data-acao]");
      if (botao?.dataset.acao === "ocultar") acoes.aoOcultar(i);
      else if (botao?.dataset.acao === "remover") acoes.aoRemover(i);
      else acoes.aoSelecionar(i);
    });
    this.janela.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-add], [data-op]");
      if (!botao) return;
      if (botao.dataset.add) acoes.aoAdicionar(botao.dataset.add);
      else acoes.aoTransformar(botao.dataset.op);
    });
    this.encaixe.addEventListener("change", () =>
      acoes.aoEncaixe(Number(this.encaixe.value)),
    );

    // O código só é lido quando o usuário dá uma pausa na digitação
    let espera;
    this.codigo.addEventListener("input", () => {
      clearTimeout(espera);
      espera = setTimeout(() => acoes.aoCodigo(this.codigo.value), 400);
    });

    this.botaoDesfazer.addEventListener("click", acoes.aoDesfazer);
    this.botaoRefazer.addEventListener("click", acoes.aoRefazer);
    porId("editor-copy").addEventListener("click", acoes.aoCopiar);
    porId("editor-download").addEventListener("click", acoes.aoBaixarSvg);
    porId("editor-png").addEventListener("click", acoes.aoBaixarPng);
    porId("editor-scratchpad").addEventListener("click", acoes.aoScratchpad);

    this.janela.addEventListener("keydown", (evento) => this.teclado(evento));
  }

  // Cor e espessura: cada arraste do seletor é um passo só no histórico
  // ("inicio" marca o primeiro movimento de uma interação)
  ligarEstilo() {
    let corEmUso = false;
    this.cor.addEventListener("input", () => {
      this.acoes.aoCor(this.cor.value, { inicio: !corEmUso });
      corEmUso = true;
    });
    this.cor.addEventListener("change", () => {
      corEmUso = false;
    });
    porId("editor-color-reset").addEventListener("click", () =>
      this.acoes.aoCor(null, { inicio: true }),
    );
    let tracoEmUso = false;
    this.traco.addEventListener("input", () => {
      this.acoes.aoTraco(Number(this.traco.value), { inicio: !tracoEmUso });
      tracoEmUso = true;
    });
    this.traco.addEventListener("change", () => {
      tracoEmUso = false;
    });
  }

  ligarBusca() {
    this.botaoIcone.addEventListener("click", () => {
      const abrir = this.busca.hidden;
      this.mostrarPainelBusca(abrir);
      if (abrir) this.acoes.aoAbrirBusca();
    });
    porId("editor-picker-close").addEventListener("click", () =>
      this.mostrarPainelBusca(false),
    );
    let espera;
    const buscar = () => {
      clearTimeout(espera);
      espera = setTimeout(
        () => this.acoes.aoBuscar(this.buscaConjunto.value, this.buscaTexto.value),
        250,
      );
    };
    this.buscaTexto.addEventListener("input", buscar);
    this.buscaConjunto.addEventListener("change", buscar);
    this.buscaResultados.addEventListener("click", (evento) => {
      const opcao = evento.target.closest("[data-k]");
      if (opcao) this.acoes.aoImportar(Number(opcao.dataset.k));
    });
  }

  // Salvar e abrir .ile: botões do editor e da página, e arrastar o arquivo
  // para dentro do editor
  ligarArquivo() {
    porId("editor-save").addEventListener("click", this.acoes.aoSalvarArquivo);
    porId("editor-share").addEventListener("click", this.acoes.aoCompartilhar);
    // Fechar pelo × e pelo clique fora passa por fechar(); o Esc dispara
    // "cancel". O "close" fica como garantia — em testes, o Chrome nem
    // sempre o disparou com um aviso animando na janela. aoFechar pode
    // rodar mais de uma vez sem problema.
    this.janela.addEventListener("cancel", this.acoes.aoFechar);
    this.janela.addEventListener("close", this.acoes.aoFechar);
    const escolher = () => {
      this.arquivo.value = "";
      this.arquivo.click();
    };
    porId("editor-open").addEventListener("click", escolher);
    porId("open-ile")?.addEventListener("click", escolher);
    this.arquivo.addEventListener("change", () => {
      const [escolhido] = this.arquivo.files;
      if (escolhido) this.acoes.aoAbrirArquivo(escolhido);
    });

    this.janela.addEventListener("dragover", (evento) => {
      if (![...evento.dataTransfer.types].includes("Files")) return;
      evento.preventDefault();
      this.janela.classList.add("editor--drop");
    });
    this.janela.addEventListener("dragleave", (evento) => {
      if (evento.target === this.janela || !this.janela.contains(evento.relatedTarget))
        this.janela.classList.remove("editor--drop");
    });
    this.janela.addEventListener("drop", (evento) => {
      this.janela.classList.remove("editor--drop");
      const [solto] = evento.dataTransfer.files;
      if (!solto) return;
      evento.preventDefault();
      this.acoes.aoAbrirArquivo(solto);
    });
  }

  mostrarPainelBusca(aberto) {
    this.busca.hidden = !aberto;
    this.botaoIcone.setAttribute("aria-expanded", String(aberto));
    if (aberto) this.buscaTexto.focus();
  }

  // conjuntos: [{ chave, rotulo }]; atual: chave escolhida de início
  prepararBusca(conjuntos, atual) {
    if (!this.buscaConjunto.options.length)
      this.buscaConjunto.innerHTML = conjuntos
        .map((c) => `<option value="${escapar(c.chave)}">${escapar(c.rotulo)}</option>`)
        .join("");
    if (atual) this.buscaConjunto.value = atual;
    return { chave: this.buscaConjunto.value, termo: this.buscaTexto.value };
  }

  // resultados: [{ nome, svg }], ou uma mensagem (carregando, erro, vazio)
  mostrarResultados(resultados) {
    if (typeof resultados === "string") {
      this.buscaResultados.innerHTML = `<p class="editor__picker-message">${escapar(resultados)}</p>`;
      return;
    }
    this.buscaResultados.innerHTML = resultados
      .map(
        (r, k) =>
          `<button type="button" class="editor__picker-icon" data-k="${k}" title="${escapar(r.nome)}" aria-label="${escapar(t("editor.pickerAdd", { name: r.nome }))}">${r.svg}</button>`,
      )
      .join("");
  }

  teclado(evento) {
    const { acoes } = this;
    // Dentro do código e dos campos, as teclas são do texto
    if (evento.target.closest("textarea, select, input")) return;
    const ctrl = evento.ctrlKey || evento.metaKey;
    const tecla = evento.key.toLowerCase();
    if (ctrl && tecla === "z" && !evento.shiftKey) acoes.aoDesfazer();
    else if (ctrl && (tecla === "y" || (tecla === "z" && evento.shiftKey)))
      acoes.aoRefazer();
    else if (evento.key === "Delete" || evento.key === "Backspace")
      acoes.aoRemover(null);
    else if (evento.key.startsWith("Arrow"))
      acoes.aoTransformar(
        { ArrowLeft: "esquerda", ArrowRight: "direita", ArrowUp: "cima", ArrowDown: "baixo" }[evento.key],
      );
    else return;
    evento.preventDefault();
  }

  // Posição do ponteiro em unidades do ícone
  pontoDoPonteiro(evento) {
    const p = this.canvas.createSVGPoint();
    p.x = evento.clientX;
    p.y = evento.clientY;
    return p.matrixTransform(this.canvas.getScreenCTM().inverse());
  }

  ligarCanvas() {
    this.canvas.addEventListener("pointerdown", (evento) => {
      if (evento.button !== 0) return;
      const ponto = evento.target.closest("[data-ponto]");
      const forma = evento.target.closest("[data-i]");
      if (!ponto && !forma) {
        this.acoes.aoSelecionar(null);
        return;
      }
      if (forma) this.acoes.aoClicarForma(Number(forma.dataset.i));
      if (!this.acoes.aoIniciarArraste()) return;
      evento.preventDefault();
      // A captura fica no próprio canvas: os nós são recriados a cada movimento
      try {
        this.canvas.setPointerCapture(evento.pointerId);
      } catch {
        // Sem captura o arraste continua, só para se o ponteiro sair do canvas
      }
      this.arraste = {
        id: evento.pointerId,
        ponto: ponto?.dataset.ponto ?? null,
        inicio: this.pontoDoPonteiro(evento),
      };
    });
    this.canvas.addEventListener("pointermove", (evento) => {
      if (!this.arraste || evento.pointerId !== this.arraste.id) return;
      const p = this.pontoDoPonteiro(evento);
      if (this.arraste.ponto) this.acoes.aoArrastarPonto(this.arraste.ponto, p.x, p.y);
      else
        this.acoes.aoArrastarElemento(
          p.x - this.arraste.inicio.x,
          p.y - this.arraste.inicio.y,
        );
    });
    const terminar = (evento) => {
      if (!this.arraste || evento.pointerId !== this.arraste.id) return;
      this.arraste = null;
      this.acoes.aoTerminarArraste();
    };
    this.canvas.addEventListener("pointerup", terminar);
    this.canvas.addEventListener("pointercancel", terminar);
  }

  // ── Desenho ────────────────────────────────────────────────────────────────
  // estado: { raiz, elementos, selecionados (Set), selecionado,
  //   grupoSelecionado, grupos, pontos, fora, viewBox, svg, estiloSelecao,
  //   podeDesfazer, podeRefazer, passo, linkStudio }
  mostrar(estado, { atualizarCodigo = true } = {}) {
    this.desenharCanvas(estado);
    this.desenharLista(estado);
    this.desenharPrevias(estado.svg);
    this.mostrarEstiloSelecao(estado.estiloSelecao);
    if (atualizarCodigo) {
      this.codigo.value = estado.svg;
      this.erro.textContent = "";
    }
    this.encaixe.value = String(estado.passo);
    this.botaoDesfazer.disabled = !estado.podeDesfazer;
    this.botaoRefazer.disabled = !estado.podeRefazer;
    this.linkStudio.hidden = !estado.linkStudio;
    if (estado.linkStudio) this.linkStudio.href = estado.linkStudio;
  }

  mostrarErro(mensagem) {
    this.erro.textContent = mensagem;
  }

  // Painel da seleção: cor e espessura (só aparece com algo selecionado)
  mostrarEstiloSelecao(estilo) {
    this.painelEstilo.hidden = !estilo;
    if (!estilo) return;
    this.cor.value = paraHex(estilo.cor) || "#2c3e50";
    this.corValor.textContent = estilo.cor ? estilo.cor : t("style.textColor");
    this.campoTraco.hidden = estilo.traco === null;
    if (estilo.traco !== null) {
      this.traco.value = estilo.traco;
      this.tracoValor.textContent = String(estilo.traco);
    }
  }

  desenharCanvas({ raiz, elementos, selecionados, pontos, viewBox, fora }) {
    const { x, y, w, h } = viewBox;
    // A margem abre espaço para pontos de controle fora da área do ícone
    // (comuns em curvas), para todos poderem ser pegos. Durante um arraste
    // ela fica parada: o zoom mudando sob o ponteiro atrapalharia.
    if (!this.arraste || this.margem === undefined)
      this.margem = Math.max(w, h) * 0.06 + fora;
    const margem = this.margem;
    this.canvas.setAttribute(
      "viewBox",
      `${x - margem} ${y - margem} ${w + 2 * margem} ${h + 2 * margem}`,
    );
    // Pixels de tela por unidade do ícone: mantém pontos e linhas da grade
    // do mesmo tamanho em qualquer ícone (24×24, 16×16…)
    // (o desenho é quadrado e centralizado: vale o menor lado do canvas)
    const lado =
      Math.min(this.canvas.clientWidth, this.canvas.clientHeight) || 480;
    const escala = lado / (w + 2 * margem);
    this.canvas.replaceChildren();

    // Grade: uma linha por unidade (ou por 1/24 da largura em ícones grandes)
    const grade = criar("g", { class: "editor__grid" });
    grade.append(criar("rect", { x, y, width: w, height: h, class: "editor__grid-bg" }));
    const passo = w <= 64 ? 1 : w / 24;
    for (let k = 0; k <= w / passo + 1e-9; k++) {
      const gx = x + k * passo;
      grade.append(criar("line", { x1: gx, y1: y, x2: gx, y2: y + h, class: k % 4 ? "" : "editor__grid-major" }));
    }
    for (let k = 0; k <= h / passo + 1e-9; k++) {
      const gy = y + k * passo;
      grade.append(criar("line", { x1: x, y1: gy, x2: x + w, y2: gy, class: k % 4 ? "" : "editor__grid-major" }));
    }
    this.canvas.append(grade);

    // O ícone, com os atributos de desenho da tag <svg>
    const desenho = {};
    for (const [nome, valor] of Object.entries(raiz))
      if (ATRIBUTOS_DE_DESENHO.has(nome)) desenho[nome] = valor;
    const icone = criar("g", { ...desenho, class: "editor__icon" });
    const cliques = criar("g", { class: "editor__hits" });
    // Contorno tracejado por cima do que está selecionado: a forma continua
    // com a cor dela (pintar de azul esconderia a cor escolhida)
    const contornos = criar("g", { class: "editor__outlines" });

    elementos.forEach((el, i) => {
      if (el.oculto) return;
      const no = el.html ? this.deHtml(el.html) : criar(el.tag, el.attrs);
      if (!no) return;
      icone.append(no);
      if (el.html) return;
      const geometria = { ...el.attrs };
      for (const nome of ATRIBUTOS_DE_DESENHO) delete geometria[nome];
      if (selecionados.has(i))
        contornos.append(criar(el.tag, {
          ...geometria,
          class: "editor__outline",
          "vector-effect": "non-scaling-stroke",
        }));
      // Cópia invisível e mais grossa da forma: facilita acertar linhas finas.
      // O interior só responde ao clique se a forma é preenchida.
      const preenchida = (el.attrs.fill ?? desenho.fill ?? "black") !== "none";
      cliques.append(criar(el.tag, {
        ...geometria,
        "data-i": i,
        fill: preenchida ? "transparent" : "none",
        stroke: "transparent",
        "stroke-width": LARGURA_CLIQUE,
        "vector-effect": "non-scaling-stroke",
      }));
    });
    this.canvas.append(icone, contornos, cliques);

    // Pontos do elemento selecionado, e linhas dos controles de curva
    if (pontos.length) {
      const camada = criar("g", { class: "editor__handles" });
      for (const p of pontos)
        if (p.de)
          camada.append(criar("line", {
            x1: p.de.x, y1: p.de.y, x2: p.x, y2: p.y,
            class: "editor__handle-line", "vector-effect": "non-scaling-stroke",
          }));
      for (const p of pontos)
        camada.append(criar("circle", {
          cx: p.x, cy: p.y, r: RAIO_PONTO / escala,
          class: `editor__handle editor__handle--${p.tipo}`,
          "data-ponto": p.id,
          "vector-effect": "non-scaling-stroke",
        }));
      this.canvas.append(camada);
    }
  }

  // Elemento que o editor não entende (g, text…): desenhado como está
  deHtml(html) {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="${NS}">${html}</svg>`,
      "image/svg+xml",
    );
    const no = doc.documentElement.firstElementChild;
    return no ? document.importNode(no, true) : null;
  }

  // Lista de formas. Com mais de um ícone, cada um ganha um cabeçalho, que
  // seleciona o ícone inteiro (para mover, girar, colorir…)
  desenharLista({ elementos, selecionado, grupos, grupoSelecionado }) {
    if (!elementos.length) {
      this.lista.innerHTML = `<li class="editor__empty">${escapar(t("editor.noElements"))}</li>`;
      return;
    }
    const linha = (el, i) => {
      const geometria = el.html
        ? null
        : Object.entries(el.attrs).filter(([k]) => !ATRIBUTOS_DE_DESENHO.has(k));
      const resumo = el.html
        ? t("editor.codeOnly")
        : el.tag === "path"
          ? el.attrs.d
          : geometria.map(([k, v]) => `${k} ${v}`).join(" · ");
      // Amostra da cor própria da forma, se ela tiver uma
      const cor = el.html
        ? null
        : [el.attrs.stroke, el.attrs.fill].find((v) => v && v !== "none" && v !== "currentColor");
      const amostra = cor
        ? `<i class="editor__swatch" style="background:${escapar(cor)}" aria-hidden="true"></i>`
        : "";
      const marcada = i === selecionado;
      return `<li class="editor__element${marcada ? " editor__element--selected" : ""}${el.oculto ? " editor__element--hidden" : ""}" data-i="${i}">
          <button type="button" class="editor__element-name" aria-pressed="${marcada}">${amostra}<strong>${escapar(el.tag)}</strong><span>${escapar(resumo || "")}</span></button>
          <button type="button" class="editor__element-action" data-acao="ocultar" title="${escapar(t(el.oculto ? "editor.show" : "editor.hide"))}" aria-label="${escapar(t(el.oculto ? "editor.showLabel" : "editor.hideLabel", { tag: el.tag }))}">${el.oculto ? "◌" : "●"}</button>
          <button type="button" class="editor__element-action" data-acao="remover" title="${escapar(t("editor.delete"))}" aria-label="${escapar(t("editor.deleteLabel", { tag: el.tag }))}">×</button>
        </li>`;
    };
    if (grupos.length < 2) {
      this.lista.innerHTML = elementos.map(linha).join("");
      return;
    }
    this.lista.innerHTML = grupos
      .map(({ grupo, nome, indices }) => {
        const marcado = grupo === grupoSelecionado;
        return `<li class="editor__group${marcado ? " editor__group--selected" : ""}">
          <button type="button" class="editor__group-name" data-grupo="${grupo}" aria-pressed="${marcado}" title="${escapar(t("editor.selectGroup"))}">${escapar(nome)}<span>${escapar(t("editor.shapes", { n: indices.length }))}</span></button>
        </li>${indices.map((i) => linha(elementos[i], i)).join("")}`;
      })
      .join("");
  }

  desenharPrevias(svg) {
    this.previas.innerHTML = PREVIAS.map(
      (tamanho) =>
        `<figure class="editor__preview"><span style="width:${tamanho}px;height:${tamanho}px">${svg}</span><figcaption>${tamanho}</figcaption></figure>`,
    ).join("");
  }
}
