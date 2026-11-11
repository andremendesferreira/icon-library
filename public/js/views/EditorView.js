import { comIdsUnicos, corCss, escapar, svgDoTexto } from "./html.js";
import { t } from "../i18n/i18n.js";
import { caminhoDaCaneta } from "../models/svgGeometry.js";
import { DEGRADES_SUGERIDOS, ehDegrade } from "../models/degrade.js";

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
const RAIO_PONTO_TOQUE = 10;
const corDaCamada = (bloco) => CORES_DAS_CAMADAS[bloco % CORES_DAS_CAMADAS.length];
// Distinguíveis entre si, nos dois temas e também com daltonismo (Okabe–Ito)
const CORES_DAS_CAMADAS = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#d55e00", "#56b4e9", "#8e44ad", "#7a8b00"];
const LARGURA_CLIQUE_TOQUE = 26;
// Em pixels: quanto o dedo precisa andar para virar arraste
const TOLERANCIA_TOQUE = 8;
// Segurar uma forma por esse tempo soma ela à seleção (ou tira, se já estava)
const TOQUE_LONGO_MS = 500;
const DUPLO_CLIQUE_MS = 350;
// Em pixels: menos que isso ainda é um clique
const MOVIMENTO_MINIMO = 4;

const PREVIAS = [16, 24, 32, 48];
// Zoom da vista: de "cabe tudo" (1) até 16 vezes
const ZOOM_MAXIMO = 16;
// Em pixels de tela: a que distância um ponto gruda em outra forma, e o
// tamanho das alças da caixa de seleção
const ENCAIXE_PX = 6;
const ALCA_PX = 9;
const ALCA_TOQUE_PX = 16;
// Giro pelas alças: de 15 em 15 graus (Shift solta)
const GIRO_PASSO = 15;

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
  botaoDuplicar = porId("editor-duplicate");
  // Unir, Subtrair, Interseção, Excluir
  botoesFormas = [...document.querySelectorAll("[data-combinar-formas]")];
  // Pontas e cantos do traço, e a caixa (X, Y, largura, altura) da seleção
  linhaPontas = porId("editor-ends");
  pontas = porId("editor-linecap");
  cantos = porId("editor-linejoin");
  campoCaixa = porId("editor-box");
  // Edição não salva de antes, para recuperar
  rascunho = porId("editor-draft");
  // Modo de corte (Separar): o próximo clique no desenho corta a forma ali
  cortando = false;
  dica = porId("editor-hint");
  contagem = porId("editor-selected-count");
  ajuda = porId("editor-help");
  layout = porId("editor-layout");
  barraDesfazer = porId("editor-undo-bar");
  barraRefazer = porId("editor-redo-bar");
  barraApagar = porId("editor-delete-bar");
  botaoVarias = porId("editor-multi");
  // Dedo em vez de mouse: alvos maiores e textos sem teclas
  toque = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  // Celular: cada toque soma ou tira uma forma, sem precisar do Shift
  varias = false;
  botaoCamadas = porId("editor-layers");
  botaoPreencher = porId("editor-fill");
  // Cada forma com uma cor, para ver a ordem. Só no desenho: o SVG não muda.
  camadas = false;
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
  // Zoom e deslocamento da vista: só a tela muda, o ícone não
  zoom = 1;
  centroVista = null;
  // Dedos na tela (pinça) e espaço apertado (arrastar move a vista)
  ponteiros = new Map();
  pinca = null;
  espaco = false;
  // Caneta: { pontos: [{ x, y, h }], cursor, puxando } ou null
  caneta = null;
  // Segurando "Original": o desenho mostra o ícone como foi aberto
  comparando = false;
  botaoCaneta = porId("editor-pen");
  botaoConcluirCaneta = porId("editor-pen-done");
  botaoOriginal = porId("editor-compare");
  rotuloZoom = porId("editor-zoom-fit");
  anuncio = porId("editor-announce");

  constructor() {
    // O editor não fecha com clique no fundo escuro: um clique fora da caixa
    // (comum ao arrastar pontos perto da borda) perdia o ícone em edição.
    // Fecha pelo × ou pelo Esc, que pedem confirmação se houver alterações.
    porId("editor-close").addEventListener("click", () => this.fechar());
    this.janela.addEventListener("cancel", (evento) => {
      evento.preventDefault();
      // Com a caneta, o Esc só sai dela; no modo de corte, só cancela o corte
      if (this.caneta) {
        this.sairDaCaneta();
        return;
      }
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
  // Aberto pela grade do scratchpad: "Salvar no scratchpad" aparece
  mostrarSalvarScratchpad(ativo) {
    porId("editor-scratchpad-save").hidden = !ativo;
  }

  mostrarEdicao(ativa) {
    porId("editor-editing").hidden = !ativa;
    const publicar = porId("editor-publish");
    if (publicar) publicar.textContent = t(ativa ? "publish.buttonEdit" : "publish.button");
  }

  abrir(nome) {
    this.zoom = 1;
    this.centroVista = null;
    this.nome.textContent = nome;
    this.erro.textContent = "";
    this.mostrarPainelBusca(false);
    if (!this.janela.open) this.janela.showModal();
    this.canvas.focus({ preventScroll: true });
  }

  // perguntar: false fecha sem confirmar (a edição já foi salva no scratchpad)
  fechar({ perguntar = true } = {}) {
    if (!this.janela.open) return;
    if (perguntar && this.acoes?.temAlteracoes() && !window.confirm(t("editor.confirmClose"))) return;
    this.janela.close();
    this.modoCorte(false);
    this.modoVarias(false);
    this.sairDaCaneta();
    this.zoom = 1;
    this.centroVista = null;
    this.camadas = false;
    this.botaoCamadas.setAttribute("aria-pressed", "false");
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
    this.ligarDegrade();
    this.ligarBusca();
    this.ligarArquivo();

    this.lista.addEventListener("click", (evento) => {
      const renomear = evento.target.closest("[data-renomear]");
      if (renomear) {
        this.renomearGrupo(Number(renomear.dataset.renomear));
        return;
      }
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
      const botao = evento.target.closest("[data-add], [data-op], [data-ordem], [data-alinhar]");
      if (!botao) return;
      if (botao.dataset.alinhar) acoes.aoAlinhar(botao.dataset.alinhar);
      else if (botao.dataset.add) acoes.aoAdicionar(botao.dataset.add);
      else if (botao.dataset.ordem) acoes.aoOrdenar(botao.dataset.ordem);
      else acoes.aoTransformar(botao.dataset.op);
    });
    // Grade: um botão por passo (data-passo), marcado com aria-pressed
    this.encaixe.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-passo]");
      if (botao) acoes.aoEncaixe(Number(botao.dataset.passo));
    });

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
    porId("editor-scratchpad-save").addEventListener("click", acoes.aoSalvarNoScratchpad);

    this.botaoMaisPonto.addEventListener("click", acoes.aoAdicionarPonto);
    this.barraDesfazer.addEventListener("click", acoes.aoDesfazer);
    this.barraRefazer.addEventListener("click", acoes.aoRefazer);
    this.barraApagar.addEventListener("click", () => acoes.aoRemover(null));
    this.botaoVarias.addEventListener("click", () => this.modoVarias(!this.varias));
    this.layout.querySelector(".editor__abas").addEventListener("click", (evento) => {
      const aba = evento.target.closest("[data-aba]");
      if (aba) this.mostrarAba(aba.dataset.aba);
    });
    // Apagado, o botão não age e explica o que falta: no celular não existe
    // a dica de passar o mouse
    const seAtivo = (botao, acao) =>
      botao.addEventListener("click", () => {
        if (botao.getAttribute("aria-disabled") === "true") acoes.aoAvisar(botao.title);
        else acao();
      });
    seAtivo(this.botaoPreencher, acoes.aoPreencher);
    seAtivo(this.botaoAgrupar, acoes.aoAgrupar);
    seAtivo(this.botaoDesagrupar, acoes.aoDesagrupar);
    seAtivo(this.botaoUnir, acoes.aoUnir);
    seAtivo(this.botaoDuplicar, acoes.aoDuplicar);
    for (const botao of this.botoesFormas) seAtivo(botao, () => acoes.aoCombinarFormas(botao.dataset.combinarFormas));
    porId("editor-optimize").addEventListener("click", acoes.aoOtimizar);
    porId("editor-draft-restore").addEventListener("click", acoes.aoRecuperarRascunho);
    porId("editor-draft-discard").addEventListener("click", acoes.aoDescartarRascunho);
    this.botaoCamadas.addEventListener("click", () => this.modoCamadas(!this.camadas));
    porId("editor-zoom-in").addEventListener("click", () => this.ampliar(1.5));
    porId("editor-zoom-out").addEventListener("click", () => this.ampliar(1 / 1.5));
    this.rotuloZoom.addEventListener("click", () => this.ajustarVista());
    this.ligarOriginal();
    this.botaoCaneta.addEventListener("click", () => {
      if (this.caneta) this.terminarCaneta();
      else this.entrarNaCaneta();
    });
    this.botaoConcluirCaneta.addEventListener("click", () => this.terminarCaneta());
    this.ligarLista();
    porId("editor-help-open").addEventListener("click", () => this.abrirAjuda());
    porId("editor-help-close").addEventListener("click", () => this.ajuda.close());
    // Clique no fundo escuro fecha a ajuda
    this.ajuda.addEventListener("click", (evento) => {
      if (evento.target === this.ajuda) this.ajuda.close();
    });
    seAtivo(this.botaoSeparar, () => {
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
    this.janela.addEventListener("keyup", (evento) => {
      if (evento.key === " " && this.espaco) {
        this.espaco = false;
        this.canvas.classList.remove("editor__canvas--mao");
      }
    });
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
    this.pontas.addEventListener("change", () => this.acoes.aoTracoAtributo("stroke-linecap", this.pontas.value));
    this.cantos.addEventListener("change", () => this.acoes.aoTracoAtributo("stroke-linejoin", this.cantos.value));
    // X, Y, largura e altura: valem ao confirmar (Enter ou sair do campo)
    for (const [eixo, id] of [["x", "editor-box-x"], ["y", "editor-box-y"], ["w", "editor-box-w"], ["h", "editor-box-h"]]) {
      const campo = porId(id);
      campo.addEventListener("change", () => {
        const valor = Number(campo.value);
        if (campo.value !== "" && Number.isFinite(valor)) this.acoes.aoCaixa({ [eixo]: valor });
      });
    }
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
          `<button type="button" class="editor__picker-icon" data-k="${k}" title="${escapar(r.nome)}" aria-label="${escapar(t("editor.pickerAdd", { name: r.nome }))}">${comIdsUnicos(r.svg)}</button>`,
      )
      .join("");
  }

  teclado(evento) {
    const { acoes } = this;
    // Dentro do código e dos campos, as teclas são do texto
    if (evento.target.closest("textarea, select, input")) return;
    const ctrlOuAlt = (e) => e.ctrlKey || e.metaKey || e.altKey;
    // Com o botão ainda apertado (arraste ou seleção por área), as teclas
    // esperam o fim do gesto
    if (this.arraste || this.area) {
      evento.preventDefault();
      return;
    }
    const ctrl = evento.ctrlKey || evento.metaKey;
    const tecla = evento.key.toLowerCase();
    // Esc: primeiro cancela o corte, depois limpa a seleção; sem nada disso,
    // segue para a janela, que pergunta se deve fechar
    if (evento.key === "Escape") {
      if (this.caneta) this.sairDaCaneta();
      else if (this.cortando) this.modoCorte(false);
      else if (!acoes.aoLimparSelecao()) return;
      evento.preventDefault();
      return;
    }
    // Caneta: Enter termina o path aberto
    if (this.caneta && evento.key === "Enter") {
      this.terminarCaneta();
      evento.preventDefault();
      return;
    }
    // Tab no desenho escolhe a forma seguinte; depois da última, o foco segue
    if (evento.key === "Tab" && evento.target === this.canvas && !ctrlOuAlt(evento)) {
      if (acoes.aoSelecionarVizinha(evento.shiftKey ? -1 : 1)) evento.preventDefault();
      return;
    }
    // Espaço segurado: arrastar move a vista
    if (evento.key === " " && evento.target === this.canvas) {
      if (!this.espaco) {
        this.espaco = true;
        this.canvas.classList.add("editor__canvas--mao");
      }
      evento.preventDefault();
      return;
    }
    if (!evento.ctrlKey && !evento.metaKey && !evento.altKey && ["+", "=", "-", "0"].includes(evento.key)) {
      if (evento.key === "0") this.ajustarVista();
      else this.ampliar(evento.key === "-" ? 1 / 1.5 : 1.5);
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
    } else if (ctrl && tecla === "d" && !evento.shiftKey) {
      // Ctrl+D: duplica (sem seleção, fica com o navegador)
      if (!acoes.aoDuplicar()) return;
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
      // Shift+seta anda 10 passos da grade
      acoes.aoTransformar(
        { ArrowLeft: "esquerda", ArrowRight: "direita", ArrowUp: "cima", ArrowDown: "baixo" }[evento.key],
        { vezes: evento.shiftKey ? 10 : 1 },
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

  modoCamadas(ligado) {
    this.camadas = ligado;
    this.botaoCamadas.setAttribute("aria-pressed", String(ligado));
    if (this.ultimoEstado) this.mostrar(this.ultimoEstado, { atualizarCodigo: false });
  }

  modoVarias(ligado) {
    this.varias = ligado;
    this.botaoVarias.setAttribute("aria-pressed", String(ligado));
  }

  mostrarAba(aba) {
    this.layout.dataset.aba = aba;
    for (const botao of this.layout.querySelectorAll(".editor__abas [data-aba]"))
      botao.setAttribute("aria-selected", String(botao.dataset.aba === aba));
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
    // Roda do mouse (ou pinça no touchpad): zoom em volta do ponteiro
    this.canvas.addEventListener("wheel", (evento) => {
      evento.preventDefault();
      const fator = Math.min(1.5, Math.max(1 / 1.5, Math.exp(-evento.deltaY * 0.0025)));
      this.ampliar(fator, this.pontoDoPonteiro(evento));
    }, { passive: false });
    this.canvas.addEventListener("pointerdown", (evento) => {
      // Dois dedos: pinça (zoom) e arraste da vista; o gesto de um dedo para
      if (evento.pointerType === "touch") {
        this.ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
        if (this.ponteiros.size >= 2) {
          evento.preventDefault();
          this.cancelarGesto();
          this.iniciarPinca();
          return;
        }
      }
      // Espaço segurado ou botão do meio: arrastar move a vista
      if (this.espaco || evento.button === 1) {
        evento.preventDefault();
        try {
          this.canvas.setPointerCapture(evento.pointerId);
        } catch {
          // Sem captura, o arraste para quando o ponteiro sai do canvas
        }
        this.pan = { id: evento.pointerId, x: evento.clientX, y: evento.clientY };
        return;
      }
      if (evento.button !== 0) return;
      if (this.caneta) {
        evento.preventDefault();
        this.porPontoDaCaneta(evento);
        return;
      }
      // Modo de corte: o clique corta a forma ali (fora do traço, avisa e
      // continua no modo)
      if (this.cortando) {
        evento.preventDefault();
        const p = this.pontoDoPonteiro(evento);
        if (this.acoes.aoSeparar(p.x, p.y)) this.modoCorte(false);
        return;
      }
      // Alças da caixa: mudar o tamanho (cantos) ou girar
      const alca = evento.target.closest("[data-alca]");
      if (alca && this.ultimoEstado?.caixaSelecao) {
        evento.preventDefault();
        if (!this.acoes.aoIniciarArraste()) return;
        try {
          this.canvas.setPointerCapture(evento.pointerId);
        } catch {
          // Sem captura, o arraste para quando o ponteiro sai do canvas
        }
        this.arraste = {
          id: evento.pointerId,
          alca: alca.dataset.alca,
          caixa: { ...this.ultimoEstado.caixaSelecao },
          inicio: this.pontoDoPonteiro(evento),
          solto: true,
        };
        return;
      }
      const ponto = evento.target.closest("[data-ponto]");
      const forma = evento.target.closest("[data-i]");
      // No vazio, ou com Shift em qualquer lugar: começa um retângulo de
      // seleção. Sem movimento, vira um clique (ver terminar)
      // Com Várias ligado, um ponto da forma continua podendo ser escolhido
      const somar = evento.shiftKey || (this.varias && !ponto);
      if (somar || (!ponto && !forma)) {
        if (!somar) this.acoes.aoSelecionar(null);
        evento.preventDefault();
        try {
          this.canvas.setPointerCapture(evento.pointerId);
        } catch {
          // Sem captura o retângulo só para se o ponteiro sair do canvas
        }
        this.area = {
          id: evento.pointerId,
          somar,
          forma: forma ? Number(forma.dataset.i) : null,
          inicio: this.pontoDoPonteiro(evento),
          tela: { x: evento.clientX, y: evento.clientY },
          no: null,
        };
        return;
      }
      // Dedo numa forma: só se sabe o que é quando ele sai, anda ou o tempo
      // passa. Selecionar já aqui apagaria a seleção antes do toque longo.
      if (forma && !ponto && evento.pointerType === "touch") {
        evento.preventDefault();
        this.iniciarToqueNaForma(evento, Number(forma.dataset.i));
        return;
      }
      if (forma) this.clicarNaForma(Number(forma.dataset.i), evento.timeStamp);
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
        // O dedo sempre treme um pouco: só vira arraste depois de um movimento
        solto: evento.pointerType !== "touch",
        tela: { x: evento.clientX, y: evento.clientY },
      };
    });
    this.canvas.addEventListener("pointermove", (evento) => {
      if (this.ponteiros.has(evento.pointerId))
        this.ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
      if (this.pinca) {
        this.moverPinca();
        return;
      }
      if (this.pan && evento.pointerId === this.pan.id) {
        this.deslocarVista((evento.clientX - this.pan.x) / this.escala, (evento.clientY - this.pan.y) / this.escala);
        this.pan.x = evento.clientX;
        this.pan.y = evento.clientY;
        return;
      }
      if (this.caneta) {
        this.moverCaneta(evento);
        return;
      }
      if (this.area && evento.pointerId === this.area.id) {
        this.moverArea(evento);
        return;
      }
      if (this.toqueForma && evento.pointerId === this.toqueForma.id) {
        this.moverToqueNaForma(evento);
        return;
      }
      if (!this.arraste || evento.pointerId !== this.arraste.id) return;
      const p = this.pontoDoPonteiro(evento);
      if (!this.arraste.solto) {
        const { tela } = this.arraste;
        if (Math.hypot(evento.clientX - tela.x, evento.clientY - tela.y) < TOLERANCIA_TOQUE) return;
        this.arraste.solto = true;
        this.arraste.inicio = p;
      }
      // Alt solta do encaixe nas outras formas
      const opcoes = { tolerancia: evento.altKey ? 0 : ENCAIXE_PX / this.escala };
      if (this.arraste.alca) this.arrastarAlca(p, evento.shiftKey);
      else if (this.arraste.ponto) this.acoes.aoArrastarPonto(this.arraste.ponto, p.x, p.y, opcoes);
      else
        this.acoes.aoArrastarElemento(
          p.x - this.arraste.inicio.x,
          p.y - this.arraste.inicio.y,
          opcoes,
        );
    });
    const terminar = (evento) => {
      this.ponteiros.delete(evento.pointerId);
      if (this.pinca) {
        if (this.ponteiros.size < 2) this.pinca = null;
        return;
      }
      if (this.pan && evento.pointerId === this.pan.id) {
        this.pan = null;
        return;
      }
      if (this.caneta) {
        this.caneta.puxando = null;
        return;
      }
      if (this.area && evento.pointerId === this.area.id) {
        this.terminarArea(evento);
        return;
      }
      if (this.toqueForma && evento.pointerId === this.toqueForma.id) {
        this.terminarToqueNaForma(evento);
        return;
      }
      if (!this.arraste || evento.pointerId !== this.arraste.id) return;
      this.arraste = null;
      this.acoes.aoTerminarArraste();
    };
    this.canvas.addEventListener("pointerup", terminar);
    this.canvas.addEventListener("pointercancel", terminar);
    // Segurar o dedo não pode abrir o menu do navegador sobre o desenho
    this.canvas.addEventListener("contextmenu", (evento) => {
      if (this.toque) evento.preventDefault();
    });
  }

  // ── Desenho ────────────────────────────────────────────────────────────────
  // estado: { raiz, elementos, selecionados (Set), selecionado,
  //   grupoSelecionado, grupos, pontos, fora, viewBox, svg, estiloSelecao,
  //   podeDesfazer, podeRefazer, passo, linkStudio, quantidade, caixa,
  //   podeAgrupar, podeDesagrupar, podeUnir, podeSeparar }
  mostrar(estado, { atualizarCodigo = true } = {}) {
    this.ultimoEstado = estado;
    this.desenharCanvas(estado);
    this.desenharLista(estado);
    this.desenharPrevias(estado.svg);
    this.mostrarEstiloSelecao(estado.estiloSelecao);
    this.mostrarDegrade(estado);
    this.mostrarCaixa(estado.estiloSelecao ? estado.caixaSelecao : null);
    this.mostrarPontos(estado);
    this.mostrarCombinar(estado);
    this.botaoPreencher.setAttribute("aria-disabled", String(!estado.podePreencher));
    this.botaoPreencher.setAttribute("aria-pressed", String(estado.preenchida));
    this.botaoPreencher.title = t(estado.podePreencher ? "editor.fillTitle" : "editor.fillNeed");
    this.barraDesfazer.disabled = !estado.podeDesfazer;
    this.barraRefazer.disabled = !estado.podeRefazer;
    this.barraApagar.disabled = !estado.quantidade;
    this.mostrarDica(estado);
    this.contagem.textContent = estado.quantidade > 1 ? `· ${t("editor.shapes", { n: estado.quantidade })}` : "";
    if (atualizarCodigo) {
      this.codigo.value = estado.svg;
      this.erro.textContent = "";
    }
    for (const botao of this.encaixe.querySelectorAll("[data-passo]"))
      botao.setAttribute("aria-pressed", String(Number(botao.dataset.passo) === estado.passo));
    this.botaoDesfazer.disabled = !estado.podeDesfazer;
    this.botaoRefazer.disabled = !estado.podeRefazer;
    this.linkStudio.hidden = !estado.linkStudio;
    if (estado.linkStudio) this.linkStudio.href = estado.linkStudio;
  }

  // Agrupar, Desagrupar, Unir e Separar ficam sempre no lugar: sem poder ser
  // usados, ficam apagados e a dica diz o que falta
  mostrarCombinar({ podeAgrupar, podeDesagrupar, podeUnir, podeSeparar, quantidade, podeCombinarFormas = {} }) {
    const botao = (no, pode, chave, chaveFalta) => {
      const texto = t(pode ? chave : chaveFalta);
      no.setAttribute("aria-disabled", String(!pode));
      no.title = texto;
      no.setAttribute("aria-label", texto);
    };
    botao(this.botaoAgrupar, podeAgrupar, "editor.groupTitle", "editor.groupNeed");
    botao(this.botaoDesagrupar, podeDesagrupar, "editor.ungroupTitle", "editor.ungroupNeed");
    botao(this.botaoUnir, podeUnir, "editor.joinTitle", "editor.joinNeed");
    botao(this.botaoSeparar, podeSeparar, "editor.splitTitle", "editor.splitNeed");
    botao(this.botaoDuplicar, quantidade > 0, "editor.duplicateTitle", "editor.duplicateNeed");
    for (const no of this.botoesFormas) {
      const op = no.dataset.combinarFormas;
      botao(no, Boolean(podeCombinarFormas[op]), `editor.${op}Title`, `editor.${op}Need`);
    }
    if (this.cortando && !podeSeparar) this.modoCorte(false);
  }

  // Uma frase para o momento, em vez de todos os atalhos de uma vez
  mostrarDica({ quantidade, grupoSelecionado, podeUnir, linhaAberta, uniaoDaForma }) {
    const chave = this.caneta
      ? "editor.penHint"
      : !quantidade
      ? "editor.hintNone"
      : uniaoDaForma && !grupoSelecionado
        ? uniaoDaForma.fecha ? "editor.hintClose" : "editor.hintLink"
      : grupoSelecionado
        ? "editor.hintGroup"
        : podeUnir
          ? "editor.hintJoin"
          : quantidade > 1
            ? "editor.hintMany"
            : linhaAberta
              ? "editor.hintLine"
              : "editor.hintOne";
    this.dica.textContent = t(this.toque ? `${chave}Touch` : chave);
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

  // Os nós são recriados a cada desenho, então o evento dblclick não chega: o
  // duplo clique é contado aqui
  clicarNaForma(i, quando) {
    const duplo = this.cliqueAnterior?.i === i && quando - this.cliqueAnterior.quando < DUPLO_CLIQUE_MS;
    this.cliqueAnterior = { i, quando };
    if (duplo) this.acoes.aoEntrarNaForma(i);
    else this.acoes.aoClicarForma(i);
  }

  iniciarToqueNaForma(evento, i) {
    try {
      this.canvas.setPointerCapture(evento.pointerId);
    } catch {
      // Sem captura o toque só termina se o dedo sair do canvas
    }
    const toque = {
      id: evento.pointerId,
      i,
      tela: { x: evento.clientX, y: evento.clientY },
      longo: false,
      temporizador: setTimeout(() => {
        toque.longo = true;
        this.acoes.aoAdicionarASelecao(i);
        navigator.vibrate?.(30);
      }, TOQUE_LONGO_MS),
    };
    this.toqueForma = toque;
  }

  // O dedo andou: em forma já selecionada vira arraste; em outra, só seleciona,
  // para encostar nela não a mover sem querer
  moverToqueNaForma(evento) {
    const toque = this.toqueForma;
    if (toque.longo) return;
    if (Math.hypot(evento.clientX - toque.tela.x, evento.clientY - toque.tela.y) < TOLERANCIA_TOQUE) return;
    clearTimeout(toque.temporizador);
    const movivel = this.acoes.aoEstaSelecionada(toque.i);
    this.toqueForma = null;
    this.acoes.aoClicarForma(toque.i);
    if (!movivel || !this.acoes.aoIniciarArraste()) return;
    this.arraste = {
      id: toque.id,
      ponto: null,
      inicio: this.pontoDoPonteiro(evento),
      solto: true,
      tela: toque.tela,
    };
  }

  terminarToqueNaForma(evento) {
    const toque = this.toqueForma;
    clearTimeout(toque.temporizador);
    this.toqueForma = null;
    if (!toque.longo && evento.type !== "pointercancel") this.clicarNaForma(toque.i, evento.timeStamp);
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
    this.linhaPontas.hidden = estilo.traco === null;
    if (estilo.traco !== null) {
      this.traco.value = estilo.traco;
      this.tracoValor.textContent = String(estilo.traco);
      this.pontas.value = estilo.pontas;
      this.cantos.value = estilo.cantos;
    }
  }

  // ── Degradê ────────────────────────────────────────────────────────────────
  // Uma sugestão aplica na hora com o tipo, o ângulo e o destino escolhidos;
  // com um degradê na seleção, mudar cores, tipo, ângulo ou destino reaplica
  // (cada mudança é um passo do histórico). As cores das sugestões são #rrggbb fixos (models/degrade.js).
  ligarDegrade() {
    this.degrade = {
      painel: porId("editor-gradient"),
      sugestoes: porId("editor-gradient-presets"),
      de: porId("editor-gradient-from"),
      ate: porId("editor-gradient-to"),
      tipo: porId("editor-gradient-type"),
      angulo: porId("editor-gradient-angle"),
      remover: porId("editor-gradient-remove"),
    };
    const d = this.degrade;
    d.angulo.value = "90";
    for (const { id, cores } of DEGRADES_SUGERIDOS) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "editor__degrade-sugestao";
      botao.dataset.de = cores[0];
      botao.dataset.ate = cores[1];
      botao.dataset.nome = id;
      botao.style.background = `linear-gradient(90deg, ${cores[0]}, ${cores[1]})`;
      d.sugestoes.append(botao);
    }
    this.rotularSugestoes();
    const alvo = () => document.querySelector('input[name="editor-gradient-target"]:checked')?.value || "fill";
    const pedir = () =>
      this.acoes.aoDegrade({
        tipo: d.tipo.value,
        cores: [d.de.value, d.ate.value],
        angulo: Number(d.angulo.value),
        alvo: alvo(),
      });
    d.sugestoes.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-de]");
      if (!botao) return;
      d.de.value = botao.dataset.de;
      d.ate.value = botao.dataset.ate;
      pedir();
    });
    d.tipo.addEventListener("change", () => {
      d.angulo.disabled = d.tipo.value === "radial";
    });
    // Ajustes só reaplicam quando a seleção já tem degradê; para criar um,
    // uma sugestão ou "Aplicar degradê"
    const reaplicar = () => {
      if (this.ultimoEstado?.degrade) pedir();
    };
    for (const campo of [d.de, d.ate, d.tipo, d.angulo]) campo.addEventListener("change", reaplicar);
    for (const radio of document.querySelectorAll('input[name="editor-gradient-target"]')) radio.addEventListener("change", reaplicar);
    porId("editor-gradient-apply").addEventListener("click", pedir);
    d.remover.addEventListener("click", () => this.acoes.aoRemoverDegrade());
  }

  // Nomes das sugestões no idioma atual (título e leitor de tela)
  rotularSugestoes() {
    for (const botao of this.degrade.sugestoes.children) {
      const nome = t(`editor.gradient_${botao.dataset.nome}`);
      botao.title = nome;
      botao.setAttribute("aria-label", nome);
    }
  }

  // Controles seguem o degradê da seleção; "Preenchimento" só com forma fechada
  mostrarDegrade({ degrade, podeDegradeFill, podeDegradeStroke }) {
    const d = this.degrade;
    this.rotularSugestoes();
    d.angulo.disabled = (degrade?.tipo ?? d.tipo.value) === "radial";
    const radios = document.querySelectorAll('input[name="editor-gradient-target"]');
    for (const r of radios) r.disabled = r.value === "fill" ? !podeDegradeFill : !podeDegradeStroke;
    if (degrade) {
      d.de.value = degrade.cores[0];
      d.ate.value = degrade.cores[degrade.cores.length - 1];
      d.tipo.value = degrade.tipo;
      if (degrade.tipo === "linear") d.angulo.value = String(degrade.angulo);
      for (const r of radios) r.checked = r.value === degrade.alvo;
    } else {
      // Destino possível: sem forma fechada, o traço
      const marcado = [...radios].find((r) => r.checked);
      if (marcado?.disabled) for (const r of radios) r.checked = !r.disabled && r.value !== marcado.value;
    }
    d.remover.disabled = !degrade;
  }

  // X, Y, largura e altura da seleção; o campo em que a pessoa está
  // digitando não é sobrescrito
  mostrarCaixa(caixa) {
    this.campoCaixa.hidden = !caixa;
    if (!caixa) return;
    const arredondar = (v) => String(Math.round(v * 100) / 100);
    for (const [eixo, id] of [["x", "editor-box-x"], ["y", "editor-box-y"], ["w", "editor-box-w"], ["h", "editor-box-h"]]) {
      const campo = porId(id);
      if (document.activeElement !== campo) campo.value = arredondar(caixa[eixo]);
    }
  }

  // texto: a frase sobre a edição não salva; null esconde
  mostrarRascunho(texto) {
    this.rascunho.hidden = !texto;
    if (texto) porId("editor-draft-text").textContent = texto;
  }

  desenharCanvas({ raiz, elementos, selecionados, pontos, pontoSelecionado, viewBox, fora, caixa, ligacao, blocos, caixaSelecao, guias, original }) {
    const { x, y, w, h } = viewBox;
    // A margem abre espaço para pontos de controle fora da área do ícone
    // (comuns em curvas), para todos poderem ser pegos. Durante um arraste
    // ela fica parada: o zoom mudando sob o ponteiro atrapalharia.
    if (!this.arraste || this.margem === undefined)
      this.margem = Math.max(w, h) * 0.06 + fora;
    const margem = this.margem;
    // Vista: o ícone com a margem (zoom 1) ou um pedaço dele, ampliado
    const base = { x: x - margem, y: y - margem, w: w + 2 * margem, h: h + 2 * margem };
    this.vistaBase = base;
    this.limitarVista();
    const vista = this.vista();
    this.canvas.setAttribute("viewBox", `${vista.x} ${vista.y} ${vista.w} ${vista.h}`);
    this.rotuloZoom.textContent = `${Math.round(this.zoom * 100)}%`;
    // Pixels de tela por unidade do ícone: mantém pontos e linhas da grade
    // do mesmo tamanho em qualquer ícone (24×24, 16×16…) e em qualquer zoom
    // (o desenho é quadrado e centralizado: vale o menor lado do canvas)
    const lado =
      Math.min(this.canvas.clientWidth, this.canvas.clientHeight) || 480;
    const escala = lado / vista.w;
    this.escala = escala;
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

    if (this.comparando && original) {
      this.desenharOriginal(original);
      return;
    }

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
      const no = el.html ? this.deHtml(el.html) : criar(el.tag, this.camadas ? this.comCorDaCamada(el, corDaCamada(blocos[i]), desenho) : el.attrs);
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
        "stroke-width": this.toque ? LARGURA_CLIQUE_TOQUE : LARGURA_CLIQUE,
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
    // Unir: as duas pontas que serão ligadas
    if (ligacao) {
      const { de, para } = ligacao;
      contornos.append(criar("line", { x1: de.x, y1: de.y, x2: para.x, y2: para.y, class: "editor__ligacao", "vector-effect": "non-scaling-stroke" }));
      for (const p of [de, para])
        contornos.append(criar("circle", { cx: p.x, cy: p.y, r: 5 / escala, class: "editor__ligacao-ponta", "vector-effect": "non-scaling-stroke" }));
    }
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
          cx: p.x, cy: p.y, r: (this.toque ? RAIO_PONTO_TOQUE : RAIO_PONTO) / escala,
          class: `editor__handle editor__handle--${p.tipo}${p.id === pontoSelecionado ? " editor__handle--sel" : ""}`,
          "data-ponto": p.id,
          "vector-effect": "non-scaling-stroke",
        }));
      this.canvas.append(camada);
    }
    if (caixaSelecao && !this.caneta && !this.cortando) this.desenharAlcas(caixaSelecao, escala);
    for (const guia of guias ?? []) {
      const v = this.vista();
      this.canvas.append(criar("line", "x" in guia
        ? { x1: guia.x, y1: v.y, x2: guia.x, y2: v.y + v.h, class: "editor__guia", "vector-effect": "non-scaling-stroke" }
        : { x1: v.x, y1: guia.y, x2: v.x + v.w, y2: guia.y, class: "editor__guia", "vector-effect": "non-scaling-stroke" }));
    }
    if (this.caneta) this.desenharCaneta(escala);
  }

  // Caixa da seleção com as alças: os quatro cantos mudam o tamanho (na
  // proporção) e a bolinha em cima gira. Ficam um pouco para fora, para não
  // cobrir os pontos da forma.
  desenharAlcas({ x, y, w, h }, escala) {
    if (w <= 0 && h <= 0) return;
    const fora = 6 / escala;
    const lado = (this.toque ? ALCA_TOQUE_PX : ALCA_PX) / escala;
    const [x0, y0, x1, y1] = [x - fora, y - fora, x + w + fora, y + h + fora];
    const g = criar("g", { class: "editor__alcas" });
    g.append(criar("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: "editor__caixa-sel", "vector-effect": "non-scaling-stroke" }));
    const topo = { x: (x0 + x1) / 2, y: y0 - 22 / escala };
    g.append(criar("line", { x1: topo.x, y1: y0, x2: topo.x, y2: topo.y, class: "editor__alca-linha", "vector-effect": "non-scaling-stroke" }));
    for (const [nome, cx, cy] of [["nw", x0, y0], ["ne", x1, y0], ["sw", x0, y1], ["se", x1, y1]])
      g.append(criar("rect", { x: cx - lado / 2, y: cy - lado / 2, width: lado, height: lado, class: "editor__alca", "data-alca": nome, "vector-effect": "non-scaling-stroke" }));
    g.append(criar("circle", { cx: topo.x, cy: topo.y, r: lado / 2 + 1 / escala, class: "editor__alca", "data-alca": "girar", "vector-effect": "non-scaling-stroke" }));
    this.canvas.append(g);
  }

  // Arraste de uma alça: canto = tamanho a partir do canto oposto; bolinha =
  // giro em volta do centro. livre (Shift): sem degraus no giro e no tamanho.
  arrastarAlca(p, livre) {
    const { alca, caixa, inicio } = this.arraste;
    const centro = { x: caixa.x + caixa.w / 2, y: caixa.y + caixa.h / 2 };
    if (alca === "girar") {
      const angulo = (a) => (Math.atan2(a.y - centro.y, a.x - centro.x) * 180) / Math.PI;
      let graus = angulo(p) - angulo(inicio);
      if (!livre) graus = Math.round(graus / GIRO_PASSO) * GIRO_PASSO;
      this.acoes.aoArrastarGiro(graus, centro.x, centro.y);
      return;
    }
    const canto = { x: alca.includes("w") ? caixa.x : caixa.x + caixa.w, y: alca.includes("n") ? caixa.y : caixa.y + caixa.h };
    const fixo = { x: 2 * centro.x - canto.x, y: 2 * centro.y - canto.y };
    const v = { x: canto.x - fixo.x, y: canto.y - fixo.y };
    const comprimento = v.x * v.x + v.y * v.y;
    if (!comprimento) return;
    let k = ((p.x - fixo.x) * v.x + (p.y - fixo.y) * v.y) / comprimento;
    // Na grade: o lado maior para em múltiplos do passo
    const passo = this.ultimoEstado?.passo;
    const maior = Math.max(caixa.w, caixa.h);
    if (!livre && passo && maior) k = (Math.round((maior * k) / passo) * passo) / maior;
    this.acoes.aoArrastarEscala(Math.max(k, 0.05), fixo.x, fixo.y);
  }

  // ── Zoom e deslocamento da vista ─────────────────────────────────────────
  vista() {
    const base = this.vistaBase;
    const w = base.w / this.zoom;
    const h = base.h / this.zoom;
    const c = this.centroVista ?? { x: base.x + base.w / 2, y: base.y + base.h / 2 };
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  }

  // O centro da vista nunca sai da área do ícone com a margem
  limitarVista() {
    if (!this.vistaBase || !this.centroVista) return;
    const b = this.vistaBase;
    this.centroVista = {
      x: Math.min(b.x + b.w, Math.max(b.x, this.centroVista.x)),
      y: Math.min(b.y + b.h, Math.max(b.y, this.centroVista.y)),
    };
  }

  // fator > 1 aproxima; foco (em unidades do ícone) fica parado na tela
  ampliar(fator, foco = null) {
    if (!this.vistaBase) return;
    const novo = Math.min(ZOOM_MAXIMO, Math.max(1, this.zoom * fator));
    if (Math.abs(novo - this.zoom) < 1e-9) return;
    const v = this.vista();
    const centro = { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const f = foco ?? centro;
    const k = this.zoom / novo;
    this.zoom = novo;
    this.centroVista = novo === 1 ? null : { x: f.x + (centro.x - f.x) * k, y: f.y + (centro.y - f.y) * k };
    this.redesenhar();
  }

  ajustarVista() {
    this.zoom = 1;
    this.centroVista = null;
    this.redesenhar();
  }

  // dx, dy em unidades do ícone (arrastar para a direita mostra o que está à esquerda)
  deslocarVista(dx, dy) {
    if (this.zoom === 1) return;
    const v = this.vista();
    this.centroVista = { x: v.x + v.w / 2 - dx, y: v.y + v.h / 2 - dy };
    this.redesenhar();
  }

  redesenhar() {
    if (this.ultimoEstado) this.mostrar(this.ultimoEstado, { atualizarCodigo: false });
  }

  // Pinça: a distância entre os dedos muda o zoom, e o meio deles arrasta a vista
  iniciarPinca() {
    const [a, b] = [...this.ponteiros.values()];
    this.pinca = { distancia: Math.hypot(a.x - b.x, a.y - b.y) || 1, meio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  moverPinca() {
    const [a, b] = [...this.ponteiros.values()];
    if (!b) return;
    const distancia = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.deslocarVista((meio.x - this.pinca.meio.x) / this.escala, (meio.y - this.pinca.meio.y) / this.escala);
    this.ampliar(distancia / this.pinca.distancia, this.pontoDoPonteiro({ clientX: meio.x, clientY: meio.y }));
    this.pinca = { distancia, meio };
  }

  // O segundo dedo chegou: o que o primeiro começou (arraste, retângulo,
  // toque numa forma) para sem efeito novo
  cancelarGesto() {
    if (this.toqueForma) {
      clearTimeout(this.toqueForma.temporizador);
      this.toqueForma = null;
    }
    if (this.area) {
      this.area.no?.remove();
      this.area = null;
    }
    if (this.arraste) {
      this.arraste = null;
      this.acoes.aoTerminarArraste();
    }
    if (this.caneta) this.caneta.puxando = null;
  }

  // ── Original: segurar o botão mostra o ícone como foi aberto ─────────────
  ligarOriginal() {
    const botao = this.botaoOriginal;
    const ligar = (ligado) => {
      if (this.comparando === ligado) return;
      this.comparando = ligado;
      botao.setAttribute("aria-pressed", String(ligado));
      this.redesenhar();
    };
    botao.addEventListener("pointerdown", (evento) => {
      evento.preventDefault();
      try {
        botao.setPointerCapture(evento.pointerId);
      } catch {
        // Sem captura, soltar fora do botão também desliga (pointerleave)
      }
      ligar(true);
    });
    for (const tipo of ["pointerup", "pointercancel", "pointerleave", "blur"]) botao.addEventListener(tipo, () => ligar(false));
    botao.addEventListener("keydown", (evento) => {
      if (evento.key === " " || evento.key === "Enter") {
        evento.preventDefault();
        ligar(true);
      }
    });
    botao.addEventListener("keyup", () => ligar(false));
    botao.addEventListener("contextmenu", (evento) => evento.preventDefault());
  }

  desenharOriginal(texto) {
    const raiz = svgDoTexto(texto);
    if (!raiz) return;
    const desenho = {};
    for (const nome of ATRIBUTOS_DE_DESENHO) if (raiz.hasAttribute(nome)) desenho[nome] = raiz.getAttribute(nome);
    const g = criar("g", { ...desenho, class: "editor__icon" });
    g.append(...raiz.childNodes);
    this.canvas.append(g);
  }

  // ── Caneta: clicar põe pontos, arrastar curva ────────────────────────────
  entrarNaCaneta() {
    this.modoCorte(false);
    this.caneta = { pontos: [], cursor: null, puxando: null };
    this.botaoCaneta.setAttribute("aria-pressed", "true");
    this.botaoConcluirCaneta.hidden = false;
    this.canvas.classList.add("editor__canvas--caneta");
    this.acoes.aoLimparSelecao();
    this.canvas.focus({ preventScroll: true });
    this.redesenhar();
  }

  sairDaCaneta() {
    if (!this.caneta) return;
    this.caneta = null;
    this.botaoCaneta.setAttribute("aria-pressed", "false");
    this.botaoConcluirCaneta.hidden = true;
    this.canvas.classList.remove("editor__canvas--caneta");
    this.redesenhar();
  }

  // Termina o path (aberto, ou fechado ao clicar no primeiro ponto)
  terminarCaneta(fechar = false) {
    const pontos = this.caneta?.pontos ?? [];
    this.sairDaCaneta();
    if (pontos.length >= 2) this.acoes.aoCriarPath(caminhoDaCaneta(pontos, fechar));
    else if (pontos.length) this.acoes.aoAvisar(t("editor.penNeed"));
  }

  encaixarNaGrade(p) {
    const passo = this.ultimoEstado?.passo;
    const f = (v) => (passo ? Math.round(v / passo) * passo : Math.round(v * 100) / 100);
    return { x: f(p.x), y: f(p.y) };
  }

  porPontoDaCaneta(evento) {
    try {
      this.canvas.setPointerCapture(evento.pointerId);
    } catch {
      // Sem captura, a curva só segue o ponteiro dentro do canvas
    }
    const p = this.encaixarNaGrade(this.pontoDoPonteiro(evento));
    const { pontos } = this.caneta;
    // Clicar no primeiro ponto fecha o path
    if (pontos.length >= 2 && Math.hypot(p.x - pontos[0].x, p.y - pontos[0].y) * this.escala <= 10) {
      this.terminarCaneta(true);
      return;
    }
    pontos.push({ x: p.x, y: p.y, h: null });
    this.caneta.puxando = { id: evento.pointerId, tela: { x: evento.clientX, y: evento.clientY } };
    this.redesenhar();
  }

  moverCaneta(evento) {
    const p = this.pontoDoPonteiro(evento);
    this.caneta.cursor = this.encaixarNaGrade(p);
    const { puxando, pontos } = this.caneta;
    // Arrastar ao pôr o ponto: a alça segue o ponteiro (vira curva)
    if (puxando && evento.pointerId === puxando.id) {
      const longe = Math.hypot(evento.clientX - puxando.tela.x, evento.clientY - puxando.tela.y) >= MOVIMENTO_MINIMO;
      pontos.at(-1).h = longe ? this.encaixarNaGrade(p) : null;
    }
    this.redesenhar();
  }

  desenharCaneta(escala) {
    const { pontos, cursor, puxando } = this.caneta;
    if (pontos.length >= 2)
      this.canvas.append(criar("path", { d: caminhoDaCaneta(pontos), class: "editor__caneta", "vector-effect": "non-scaling-stroke" }));
    // Até onde o próximo ponto iria
    if (pontos.length && cursor && !puxando)
      this.canvas.append(criar("path", { d: caminhoDaCaneta([pontos.at(-1), { ...cursor, h: null }]), class: "editor__caneta editor__caneta--elastico", "vector-effect": "non-scaling-stroke" }));
    const ultimo = pontos.at(-1);
    if (ultimo?.h) {
      const espelho = { x: 2 * ultimo.x - ultimo.h.x, y: 2 * ultimo.y - ultimo.h.y };
      this.canvas.append(criar("line", { x1: espelho.x, y1: espelho.y, x2: ultimo.h.x, y2: ultimo.h.y, class: "editor__handle-line", "vector-effect": "non-scaling-stroke" }));
    }
    pontos.forEach((p, k) =>
      this.canvas.append(criar("circle", {
        cx: p.x, cy: p.y, r: (this.toque ? RAIO_PONTO_TOQUE : RAIO_PONTO) / escala,
        class: `editor__caneta-ponto${k === 0 ? " editor__caneta-ponto--primeiro" : ""}`,
        "vector-effect": "non-scaling-stroke",
      })),
    );
  }

  // ── Lista de formas: arrastar para reordenar, renomear grupos ────────────
  ligarLista() {
    let arrastada = null;
    this.lista.addEventListener("dragstart", (evento) => {
      const item = evento.target.closest("[data-i]");
      if (!item) return;
      arrastada = Number(item.dataset.i);
      evento.dataTransfer.effectAllowed = "move";
      evento.dataTransfer.setData("text/plain", String(arrastada));
    });
    this.lista.addEventListener("dragover", (evento) => {
      const item = evento.target.closest("[data-i]");
      if (arrastada === null || !item) return;
      evento.preventDefault();
      for (const outro of this.lista.querySelectorAll(".editor__element--alvo")) outro.classList.remove("editor__element--alvo");
      item.classList.add("editor__element--alvo");
    });
    this.lista.addEventListener("drop", (evento) => {
      const item = evento.target.closest("[data-i]");
      if (arrastada === null || !item) return;
      evento.preventDefault();
      this.acoes.aoMoverForma(arrastada, Number(item.dataset.i));
    });
    this.lista.addEventListener("dragend", () => {
      arrastada = null;
      for (const outro of this.lista.querySelectorAll(".editor__element--alvo")) outro.classList.remove("editor__element--alvo");
    });
  }

  renomearGrupo(grupo) {
    const cabecalho = this.lista.querySelector(`.editor__group-name[data-grupo="${grupo}"]`);
    const nome = this.ultimoEstado?.grupos.find((g) => g.grupo === grupo)?.nome ?? "";
    if (!cabecalho) return;
    const campo = document.createElement("input");
    campo.className = "editor__group-input";
    campo.value = nome;
    campo.maxLength = 60;
    campo.setAttribute("aria-label", t("editor.renameGroup"));
    cabecalho.replaceWith(campo);
    campo.focus();
    campo.select();
    let feito = false;
    const concluir = (salvar) => {
      if (feito) return;
      feito = true;
      if (salvar && campo.value.trim() && campo.value.trim() !== nome) this.acoes.aoRenomearGrupo(grupo, campo.value);
      else this.redesenhar();
    };
    campo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") concluir(true);
      else if (evento.key === "Escape") {
        // O Esc fica no campo: não fecha o editor
        evento.preventDefault();
        evento.stopPropagation();
        concluir(false);
      }
    });
    campo.addEventListener("blur", () => concluir(true));
  }

  // Frase para leitores de tela (sem aparecer na tela)
  anunciar(texto) {
    this.anuncio.textContent = "";
    // Trocar o texto num quadro seguinte faz o leitor repetir frases iguais
    requestAnimationFrame(() => (this.anuncio.textContent = texto));
  }

  // Atributos da forma com a cor da camada, sem tocar no que é "none"
  comCorDaCamada(el, cor, desenho) {
    const attrs = { ...el.attrs };
    if ((attrs.stroke ?? desenho.stroke ?? "none") !== "none") attrs.stroke = cor;
    if ((attrs.fill ?? desenho.fill ?? "black") !== "none") attrs.fill = cor;
    return attrs;
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
  desenharLista({ elementos, selecionados, grupos, grupoSelecionado, blocos }) {
    // Com as camadas ligadas, a lista diz o que está na frente e no fundo. Num
    // grupo, o aviso fica no cabeçalho: ele conta como um bloco só.
    const ultimo = elementos.length - 1;
    const rotuloDaCamada = (indices) => {
      if (!this.camadas || new Set(blocos).size < 2) return "";
      const texto = indices.includes(0) ? t("editor.layerBack") : indices.includes(ultimo) ? t("editor.layerFront") : "";
      return texto ? `<em class="editor__layer">${escapar(texto)}</em>` : "";
    };
    const amostraDe = (cor) =>
      corCss(cor) ? `<i class="editor__swatch" style="background:${escapar(corCss(cor))}" aria-hidden="true"></i>` : "";
    if (!elementos.length) {
      this.lista.innerHTML = `<li class="editor__empty">${escapar(t("editor.noElements"))}</li>`;
      return;
    }
    const linha = (el, i) => {
      // O degradê é um elemento do ícone, mas não é forma: fica fora da lista
      if (ehDegrade(el)) return "";
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
      const amostra = amostraDe(this.camadas ? corDaCamada(blocos[i]) : cor);
      const rotulo = el.grupo ? "" : rotuloDaCamada([i]);
      // A forma selecionada e a marcada com Shift (num ícone inteiro, só o cabeçalho)
      const marcada = grupoSelecionado === null && selecionados.has(i);
      return `<li class="editor__element${marcada ? " editor__element--selected" : ""}${el.oculto ? " editor__element--hidden" : ""}" data-i="${i}" draggable="true">
          <button type="button" class="editor__element-name" aria-pressed="${marcada}">${amostra}<strong>${escapar(el.tag)}</strong>${rotulo}<span>${escapar(resumo || "")}</span></button>
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
          <button type="button" class="editor__group-name" data-grupo="${grupo}" aria-pressed="${marcado}" title="${escapar(t("editor.selectGroup"))}">${grupo ? amostraDe(this.camadas ? corDaCamada(blocos[indices[0]]) : null) : ""}${escapar(nome)}${grupo ? rotuloDaCamada(indices) : ""}<span>${escapar(t("editor.shapes", { n: indices.length }))}</span></button>
          ${grupo ? `<button type="button" class="editor__element-action" data-renomear="${grupo}" title="${escapar(t("editor.renameGroup"))}" aria-label="${escapar(t("editor.renameGroupLabel", { name: nome }))}">✎</button>` : ""}
        </li>${indices.map((i) => linha(elementos[i], i)).join("")}`;
      })
      .join("");
  }

  // O SVG entra pelo parser XML, não por innerHTML: o que for inerte em XML
  // continua inerte na página
  desenharPrevias(svg) {
    const linha = (escura) =>
      `<div class="editor__previews-linha${escura ? " editor__previews-linha--escura" : ""}" aria-label="${escapar(t(escura ? "editor.previewDark" : "editor.previewLight"))}">${PREVIAS.map(
        (tamanho) =>
          `<figure class="editor__preview"><span style="width:${tamanho}px;height:${tamanho}px"></span>${escura ? "" : `<figcaption>${tamanho}</figcaption>`}</figure>`,
      ).join("")}</div>`;
    this.previas.innerHTML = linha(false) + linha(true);
    // Cada prévia com ids próprios: o degradê de uma não pinta a outra
    for (const caixa of this.previas.querySelectorAll("span")) {
      const desenho = svgDoTexto(comIdsUnicos(svg));
      if (desenho) caixa.append(desenho);
    }
  }
}
