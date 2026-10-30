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
const DUPLO_CLIQUE_MS = 350;
// Em pixels: menos que isso ainda é um clique
const MOVIMENTO_MINIMO = 4;

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
  painelPontos = porId("editor-points");
  botaoMaisPonto = porId("editor-point-add");
  botaoAgrupar = porId("editor-group");
  botaoDesagrupar = porId("editor-ungroup");
  botaoUnir = porId("editor-join");
  botaoSeparar = porId("editor-split");
  // Modo de corte (Separar): o próximo clique no desenho corta a forma ali
  cortando = false;
  dica = porId("editor-hint");
  contagem = porId("editor-selected-count");
  ajuda = porId("editor-help");
  botaoMenosPonto = porId("editor-point-remove");
  dicaPontos = porId("editor-points-hint");
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
    // O editor não fecha com clique no fundo escuro: um clique fora da caixa
    // (comum ao arrastar pontos perto da borda) perdia o ícone em edição.
    // Fecha pelo × ou pelo Esc, que pedem confirmação se houver alterações.
    porId("editor-close").addEventListener("click", () => this.fechar());
    this.janela.addEventListener("cancel", (evento) => {
      evento.preventDefault();
      // No modo de corte, o Esc só cancela o corte
      if (this.cortando) {
        this.modoCorte(false);
        return;
      }
      this.fechar();
    });
  }

  get aberto() {
    return this.janela.open;
  }

  // Editando um ícone já publicado: aviso no topo e o botão de publicar vira
  // "enviar edição"
  mostrarEdicao(ativa) {
    porId("editor-editing").hidden = !ativa;
    const publicar = porId("editor-publish");
    if (publicar) publicar.textContent = t(ativa ? "publish.buttonEdit" : "publish.button");
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
    if (this.acoes?.temAlteracoes() && !window.confirm(t("editor.confirmClose"))) return;
    this.janela.close();
    this.modoCorte(false);
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
      else if (evento.shiftKey) acoes.aoAdicionarASelecao(i);
      else acoes.aoSelecionar(i);
    });
    this.janela.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-add], [data-op], [data-ordem]");
      if (!botao) return;
      if (botao.dataset.add) acoes.aoAdicionar(botao.dataset.add);
      else if (botao.dataset.ordem) acoes.aoOrdenar(botao.dataset.ordem);
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

    this.botaoMaisPonto.addEventListener("click", acoes.aoAdicionarPonto);
    this.botaoAgrupar.addEventListener("click", acoes.aoAgrupar);
    this.botaoDesagrupar.addEventListener("click", acoes.aoDesagrupar);
    this.botaoUnir.addEventListener("click", acoes.aoUnir);
    porId("editor-help-open").addEventListener("click", () => this.abrirAjuda());
    porId("editor-help-close").addEventListener("click", () => this.ajuda.close());
    // Clique no fundo escuro fecha a ajuda
    this.ajuda.addEventListener("click", (evento) => {
      if (evento.target === this.ajuda) this.ajuda.close();
    });
    this.botaoSeparar.addEventListener("click", () => {
      this.modoCorte(!this.cortando);
      if (this.cortando) acoes.aoIniciarCorte();
    });
    this.botaoMenosPonto.addEventListener("click", () => {
      acoes.aoRemoverPonto();
      // O botão fica desativado depois de apagar e o navegador tira o foco
      // dele: o foco volta ao desenho, para Delete e Ctrl+Z seguirem valendo
      this.canvas.focus();
    });
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
    // Fechar pelo × e pelo Esc passa por fechar(), que chama aoFechar. O
    // "close" fica como garantia — em testes, o Chrome nem sempre o disparou
    // com um aviso animando na janela. aoFechar pode rodar mais de uma vez.
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
    // Esc: primeiro cancela o corte, depois limpa a seleção; sem nada disso,
    // segue para a janela, que pergunta se deve fechar
    if (evento.key === "Escape") {
      if (this.cortando) this.modoCorte(false);
      else if (!acoes.aoLimparSelecao()) return;
      evento.preventDefault();
      return;
    }
    if (evento.key === "?") {
      this.abrirAjuda();
      evento.preventDefault();
      return;
    }
    // Sem forma selecionada (ou nada copiado), Ctrl+C/V ficam com o navegador
    if (ctrl && tecla === "c" && !evento.shiftKey) {
      if (!acoes.aoCopiarForma()) return;
    } else if (ctrl && tecla === "v" && !evento.shiftKey) {
      if (!acoes.aoColarForma()) return;
    } else if (ctrl && tecla === "a" && !evento.shiftKey) {
      acoes.aoSelecionarTudo();
    } else if (ctrl && tecla === "g") {
      // Ctrl+G e Ctrl+Shift+G: sem o que agrupar, ficam com o navegador
      if (!(evento.shiftKey ? acoes.aoDesagrupar() : acoes.aoAgrupar())) return;
    } else if (ctrl && tecla === "j" && !evento.shiftKey) {
      // Ctrl+J: une as duas formas marcadas (sem elas, fica com o navegador)
      if (!acoes.aoUnir()) return;
    } else if (ctrl && tecla === "z" && !evento.shiftKey) acoes.aoDesfazer();
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

  // Liga ou desliga o modo de corte: cursor de alvo no desenho e o botão
  // Separar marcado
  modoCorte(ligado) {
    this.cortando = ligado;
    this.canvas.classList.toggle("editor__canvas--corte", ligado);
    this.botaoSeparar.setAttribute("aria-pressed", String(ligado));
  }

  // Ajuda dos comandos: no Mac, a tecla Ctrl aparece como ⌘
  abrirAjuda() {
    if (this.ajuda.open) return;
    if (/Mac/.test(navigator.platform))
      for (const tecla of this.ajuda.querySelectorAll("kbd[data-ctrl]")) tecla.textContent = "⌘";
    this.ajuda.showModal();
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
      // Modo de corte: o clique corta a forma ali (fora do traço, avisa e
      // continua no modo)
      if (this.cortando) {
        evento.preventDefault();
        const p = this.pontoDoPonteiro(evento);
        if (this.acoes.aoSeparar(p.x, p.y)) this.modoCorte(false);
        return;
      }
      const ponto = evento.target.closest("[data-ponto]");
      const forma = evento.target.closest("[data-i]");
      // No vazio, ou com Shift em qualquer lugar: começa um retângulo de
      // seleção. Sem movimento, vira um clique (ver terminar)
      if (evento.shiftKey || (!ponto && !forma)) {
        if (!evento.shiftKey) this.acoes.aoSelecionar(null);
        evento.preventDefault();
        try {
          this.canvas.setPointerCapture(evento.pointerId);
        } catch {
          // Sem captura o retângulo só para se o ponteiro sair do canvas
        }
        this.area = {
          id: evento.pointerId,
          somar: evento.shiftKey,
          forma: forma ? Number(forma.dataset.i) : null,
          inicio: this.pontoDoPonteiro(evento),
          tela: { x: evento.clientX, y: evento.clientY },
          no: null,
        };
        return;
      }
      if (forma) {
        const i = Number(forma.dataset.i);
        // Os nós são recriados a cada desenho, então o evento dblclick não
        // chega: o duplo clique é contado aqui
        const agora = evento.timeStamp;
        const duplo = this.cliqueAnterior?.i === i && agora - this.cliqueAnterior.quando < DUPLO_CLIQUE_MS;
        this.cliqueAnterior = { i, quando: agora };
        if (duplo) this.acoes.aoEntrarNaForma(i);
        else this.acoes.aoClicarForma(i);
      }
      if (ponto) this.acoes.aoSelecionarPonto(ponto.dataset.ponto);
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
      if (this.area && evento.pointerId === this.area.id) {
        this.moverArea(evento);
        return;
      }
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
      if (this.area && evento.pointerId === this.area.id) {
        this.terminarArea(evento);
        return;
      }
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
  //   podeDesfazer, podeRefazer, passo, linkStudio, quantidade, caixa,
  //   podeAgrupar, podeDesagrupar, podeUnir, podeSeparar }
  mostrar(estado, { atualizarCodigo = true } = {}) {
    this.desenharCanvas(estado);
    this.desenharLista(estado);
    this.desenharPrevias(estado.svg);
    this.mostrarEstiloSelecao(estado.estiloSelecao);
    this.mostrarPontos(estado);
    this.mostrarCombinar(estado);
    this.mostrarDica(estado);
    this.contagem.textContent = estado.quantidade > 1 ? `· ${t("editor.shapes", { n: estado.quantidade })}` : "";
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

  // Agrupar, Desagrupar, Unir e Separar ficam sempre no lugar: sem poder ser
  // usados, ficam apagados e a dica diz o que falta
  mostrarCombinar({ podeAgrupar, podeDesagrupar, podeUnir, podeSeparar }) {
    const botao = (no, pode, chave, chaveFalta) => {
      const texto = t(pode ? chave : chaveFalta);
      no.disabled = !pode;
      no.title = texto;
      no.setAttribute("aria-label", texto);
    };
    botao(this.botaoAgrupar, podeAgrupar, "editor.groupTitle", "editor.groupNeed");
    botao(this.botaoDesagrupar, podeDesagrupar, "editor.ungroupTitle", "editor.ungroupNeed");
    botao(this.botaoUnir, podeUnir, "editor.joinTitle", "editor.joinNeed");
    botao(this.botaoSeparar, podeSeparar, "editor.splitTitle", "editor.splitNeed");
    if (this.cortando && !podeSeparar) this.modoCorte(false);
  }

  // Uma frase para o momento, em vez de todos os atalhos de uma vez
  mostrarDica({ quantidade, grupoSelecionado }) {
    const chave = !quantidade
      ? "editor.hintNone"
      : grupoSelecionado
        ? "editor.hintGroup"
        : quantidade > 1
          ? "editor.hintMany"
          : "editor.hintOne";
    this.dica.textContent = t(chave);
  }

  // Botões + Ponto / − Ponto: aparecem com uma forma de traço selecionada;
  // ativos quando há um ponto clicado que permite a ação
  mostrarPontos({ editaPontos, pontoSelecionado, podeAdicionarPonto, podeRemoverPonto }) {
    this.painelPontos.hidden = !editaPontos;
    this.botaoMaisPonto.disabled = !podeAdicionarPonto;
    this.botaoMenosPonto.disabled = !podeRemoverPonto;
    this.dicaPontos.hidden = pontoSelecionado !== null;
  }

  mostrarErro(mensagem) {
    this.erro.textContent = mensagem;
  }

  // Retângulo de seleção: só aparece depois de um pequeno movimento, para um
  // clique com a mão tremendo não virar seleção por área
  retanguloDaArea(evento) {
    const a = this.area.inicio;
    const b = this.pontoDoPonteiro(evento);
    return {
      x1: Math.min(a.x, b.x),
      y1: Math.min(a.y, b.y),
      x2: Math.max(a.x, b.x),
      y2: Math.max(a.y, b.y),
    };
  }

  moverArea(evento) {
    const { tela } = this.area;
    if (!this.area.no) {
      if (Math.hypot(evento.clientX - tela.x, evento.clientY - tela.y) < MOVIMENTO_MINIMO) return;
      this.area.no = criar("rect", { class: "editor__area", "vector-effect": "non-scaling-stroke" });
      this.canvas.append(this.area.no);
    }
    const { x1, y1, x2, y2 } = this.retanguloDaArea(evento);
    for (const [nome, valor] of Object.entries({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 }))
      this.area.no.setAttribute(nome, valor);
  }

  terminarArea(evento) {
    const { no, somar, forma } = this.area;
    const retangulo = no ? this.retanguloDaArea(evento) : null;
    no?.remove();
    this.area = null;
    if (evento.type === "pointercancel") return;
    if (retangulo) this.acoes.aoSelecionarArea(retangulo, { somar });
    else if (forma !== null) this.acoes.aoAdicionarASelecao(forma);
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

  desenharCanvas({ raiz, elementos, selecionados, pontos, pontoSelecionado, viewBox, fora, caixa }) {
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
    // Várias formas: uma caixa em volta mostra que a ação vale para todas
    if (caixa)
      contornos.append(criar("rect", {
        x: caixa.minX,
        y: caixa.minY,
        width: caixa.maxX - caixa.minX,
        height: caixa.maxY - caixa.minY,
        class: "editor__box",
        "vector-effect": "non-scaling-stroke",
      }));
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
          class: `editor__handle editor__handle--${p.tipo}${p.id === pontoSelecionado ? " editor__handle--sel" : ""}`,
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
  desenharLista({ elementos, selecionados, grupos, grupoSelecionado }) {
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
      // A forma selecionada e a marcada com Shift (num ícone inteiro, só o cabeçalho)
      const marcada = grupoSelecionado === null && selecionados.has(i);
      return `<li class="editor__element${marcada ? " editor__element--selected" : ""}${el.oculto ? " editor__element--hidden" : ""}" data-i="${i}">
          <button type="button" class="editor__element-name" aria-pressed="${marcada}">${amostra}<strong>${escapar(el.tag)}</strong><span>${escapar(resumo || "")}</span></button>
          <button type="button" class="editor__element-action" data-acao="ocultar" title="${escapar(t(el.oculto ? "editor.show" : "editor.hide"))}" aria-label="${escapar(t(el.oculto ? "editor.showLabel" : "editor.hideLabel", { tag: el.tag }))}">${el.oculto ? "◌" : "●"}</button>
          <button type="button" class="editor__element-action" data-acao="remover" title="${escapar(t("editor.delete"))}" aria-label="${escapar(t("editor.deleteLabel", { tag: el.tag }))}">×</button>
        </li>`;
    };
    // Sem grupos, a lista é simples: só as formas soltas do ícone aberto
    if (grupos.length < 2 && !grupos[0]?.grupo) {
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
