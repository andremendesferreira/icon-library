import { TAMANHO_MAXIMO_ILE, tamanhoDoPng } from "../models/EditorModel.js";
import { linkDoStudio } from "../models/IconModel.js";
import { lerFragmento, linkDoProjeto } from "../models/linkCodec.js";
import { nomeDeArquivo } from "../models/svgTools.js";
import { copiarTexto } from "./clipboard.js";
import { idiomaAtual, t, tErro } from "../i18n/i18n.js";
import { baixarPngDeSvg, baixarSvg, baixarTexto } from "./download.js";

// Cor de "currentColor" num PNG solto, onde não há texto para herdar a cor
const COR_PNG = "#2c3e50";

// Edição não salva, para recuperar depois de recarregar ou fechar a aba
const CHAVE_RASCUNHO = "icon-library:editor-draft";
const VALIDADE_RASCUNHO_MS = 7 * 24 * 60 * 60 * 1000;
// Rascunho grande demais não vale o espaço do navegador
const TAMANHO_MAXIMO_RASCUNHO = 512 * 1024;

// "há 5 minutos", no idioma da página
function haQuanto(quando) {
  const segundos = Math.round((quando - Date.now()) / 1000);
  const formato = new Intl.RelativeTimeFormat(idiomaAtual(), { numeric: "auto" });
  for (const [unidade, s] of [["day", 86400], ["hour", 3600], ["minute", 60]])
    if (Math.abs(segundos) >= s) return formato.format(Math.round(segundos / s), unidade);
  return formato.format(segundos, "second");
}

// Liga o editor de ícones: cada ação do usuário muda o model e redesenha.
export class EditorController {
  item = null;
  // Resultados da última busca de ícones (o clique devolve a posição)
  resultados = [];
  buscaAtual = 0;

  // avisar(mensagem): aviso na tela; aoAdicionar(item, svg): scratchpad
  // catalogo: os ícones da página, para pôr outro por cima —
  //   { conjuntos(), atual(), buscar(chave, termo), svg(item), rotulo(chave) }
  // escolherTamanhoPng(sugerido): pergunta o tamanho do PNG (null = desistiu)
  constructor(model, view, { avisar, aoAdicionar, catalogo, escolherTamanhoPng }) {
    this.model = model;
    this.view = view;
    this.avisar = avisar;
    this.escolherTamanhoPng = escolherTamanhoPng;
    this.aoAdicionar = aoAdicionar;
    this.catalogo = catalogo;
  }

  iniciar() {
    const { model } = this;
    const mudar =
      (acao) =>
      (...args) => {
        acao(...args);
        this.desenhar();
      };
    const mudarSelecao =
      (acao) =>
      (...args) => {
        acao(...args);
        this.desenhar({ atualizarCodigo: false });
      };
    this.view.ligar({
      aoSelecionar: (i) => {
        model.selecionar(i);
        this.desenhar({ atualizarCodigo: false });
      },
      aoSelecionarGrupo: (grupo) => {
        model.selecionarGrupo(grupo);
        this.desenhar({ atualizarCodigo: false });
      },
      aoClicarForma: (i) => {
        model.clicarForma(i);
        this.desenhar({ atualizarCodigo: false });
      },
      aoAdicionarASelecao: (i) => {
        model.adicionarASelecao(i);
        this.desenhar({ atualizarCodigo: false });
      },
      aoEntrarNaForma: mudarSelecao((i) => model.selecionar(i)),
      aoSelecionarArea: mudarSelecao((retangulo, opcoes) => model.selecionarArea(retangulo, opcoes)),
      aoSelecionarTudo: mudarSelecao(() => model.selecionarTudo()),
      // Devolve se havia seleção para limpar (senão o Esc segue para a janela)
      aoLimparSelecao: () => {
        if (!model.temSelecao) return false;
        model.limparSelecao();
        this.desenhar({ atualizarCodigo: false });
        return true;
      },
      // Devolvem se agiram (o atalho sem efeito segue para o navegador)
      aoAgrupar: () => {
        const n = model.grupos.filter((g) => g.manual).length + 1;
        if (!model.agrupar(t("editor.groupName", { n }))) return false;
        this.desenhar();
        return true;
      },
      aoDesagrupar: () => {
        if (!model.desagrupar()) return false;
        this.desenhar();
        return true;
      },
      aoAvisar: (mensagem) => this.avisar(mensagem),
      aoEstaSelecionada: (i) => model.temSelecao && model.alvos().includes(i),
      aoPreencher: () => {
        if (model.alternarPreenchimento()) this.desenhar();
      },
      aoDegrade: (pedido) => {
        if (model.aplicarDegrade(pedido)) this.desenhar();
        else this.avisar(t(pedido.alvo === "fill" ? "editor.gradientNeedFill" : "editor.gradientNeedStroke"));
      },
      aoRemoverDegrade: () => {
        if (model.removerDegrade()) this.desenhar();
      },
      aoIniciarCorte: () => this.avisar(t(this.view.toque ? "editor.splitHintTouch" : "editor.splitHint")),
      // Devolve se cortou; fora do traço, avisa e o modo de corte continua
      aoSeparar: (x, y) => {
        if (!model.separar(x, y)) {
          this.avisar(t(this.view.toque ? "editor.splitMissTouch" : "editor.splitMiss"));
          return false;
        }
        this.desenhar();
        this.avisarDesfazivel(t("editor.splitDone"));
        return true;
      },
      aoDuplicar: () => {
        if (!model.duplicar()) return false;
        this.desenhar();
        return true;
      },
      aoAlinhar: (operacao) => {
        if (model.alinhar(operacao)) this.desenhar();
        else if (operacao.startsWith("distribuir")) this.avisar(t("editor.distributeNeed"));
      },
      aoTracoAtributo: (atributo, valor) => {
        if (model.definirAtributoDoTraco(atributo, valor)) this.desenhar();
      },
      aoCaixa: (valores) => {
        if (model.definirCaixa(valores)) this.desenhar();
        else this.desenhar({ atualizarCodigo: false });
      },
      aoOtimizar: () => {
        const ganho = model.otimizar();
        if (!ganho) {
          this.avisar(t("editor.optimizedNone"));
          return;
        }
        this.desenhar();
        this.avisarDesfazivel(t("editor.optimized", { n: ganho }));
      },
      aoRecuperarRascunho: () => this.recuperarRascunho(),
      aoDescartarRascunho: () => {
        this.apagarRascunho();
        this.view.mostrarRascunho(null);
      },
      // Devolve se agiu (Ctrl+J sem duas formas marcadas segue normal)
      aoUnir: () => {
        if (!model.quantidade) return false;
        if (model.unir()) {
          this.desenhar();
          this.avisarDesfazivel(t("editor.joined"));
        } else this.avisar(t("editor.joinNeed"));
        return true;
      },
      aoIniciarArraste: () => model.iniciarArraste(),
      aoArrastarPonto: mudar((id, x, y, opcoes) => model.arrastarPonto(id, x, y, opcoes)),
      aoArrastarElemento: mudar((dx, dy, opcoes) => model.arrastarElemento(dx, dy, opcoes)),
      aoArrastarEscala: mudar((k, x, y) => model.arrastarEscala(k, x, y)),
      aoArrastarGiro: mudar((graus, x, y) => model.arrastarGiro(graus, x, y)),
      aoCriarPath: (d) => {
        if (model.adicionarPath(d)) this.desenhar();
      },
      aoMoverForma: (de, para) => {
        if (model.moverForma(de, para)) this.desenhar();
        else if (model.elementos[de]?.grupo !== model.elementos[para]?.grupo) this.avisar(t("editor.reorderSameGroup"));
      },
      aoRenomearGrupo: (grupo, nome) => {
        model.renomearGrupo(grupo, nome);
        this.desenhar({ atualizarCodigo: false });
      },
      // Tab no desenho: devolve se escolheu uma forma (senão o foco segue)
      aoSelecionarVizinha: (passo) => {
        const i = model.selecionarVizinha(passo);
        if (i === null) return false;
        this.desenhar({ atualizarCodigo: false });
        const visiveis = model.elementos.filter((el) => !el.oculto);
        this.view.anunciar(t("editor.announceShape", {
          tag: model.elementos[i].tag,
          n: visiveis.indexOf(model.elementos[i]) + 1,
          total: visiveis.length,
        }));
        return true;
      },
      aoTerminarArraste: mudar(() => model.terminarArraste()),
      aoAdicionar: mudar((tag) => model.adicionar(tag)),
      // Sem índice: apaga a seleção (forma ou ícone inteiro)
      // Sem índice (tecla Delete): com um ponto selecionado, apaga o ponto
      aoRemover: (i) => {
        if (i === null && model.pontoSelecionado !== null) {
          if (model.removerPontoSelecionado()) this.desenhar();
          else this.avisar(t("editor.pointCantRemove"));
          return;
        }
        const n = i === null ? model.quantidade : 1;
        const antes = model.elementos.length;
        model.remover(i);
        this.desenhar();
        if (model.elementos.length < antes) this.avisarDesfazivel(t("editor.deleted", { n }));
      },
      aoSelecionarPonto: (id) => {
        model.selecionarPonto(id);
        this.desenhar({ atualizarCodigo: false });
      },
      aoRemoverPonto: () => {
        if (model.removerPontoSelecionado()) this.desenhar();
        else this.avisar(t("editor.pointCantRemove"));
      },
      aoAdicionarPonto: () => {
        if (model.adicionarPontoNoSelecionado()) this.desenhar();
      },
      aoOcultar: mudar((i) => model.alternarOculto(i)),
      aoTransformar: (operacao, opcoes) => {
        const fixos = model.transformar(operacao, opcoes);
        this.desenhar();
        if (fixos)
          this.avisar(t("editor.codeOnlyChanged", { n: fixos }));
      },
      aoOrdenar: (operacao) => {
        if (!model.temSelecao) this.avisar(t("editor.orderNeedsSelection"));
        else if (model.ordenar(operacao)) this.desenhar();
      },
      aoEncaixe: (passo) => {
        model.passo = passo;
      },
      aoCor: mudar((cor, { inicio }) =>
        model.definirCor(cor, { registrar: inicio }),
      ),
      aoTraco: mudar((largura, { inicio }) =>
        model.definirTraco(largura, { registrar: inicio }),
      ),
      aoAbrirBusca: () => {
        const { chave, termo } = this.view.prepararBusca(
          this.catalogo.conjuntos(),
          this.catalogo.atual(),
        );
        this.buscar(chave, termo);
      },
      aoBuscar: (chave, termo) => this.buscar(chave, termo),
      aoImportar: (k) => this.importar(k),
      aoCodigo: (texto) => this.aplicarCodigo(texto),
      // Ctrl+C / Ctrl+V: devolvem se agiram (senão a tecla segue normal)
      aoCopiarForma: () => {
        if (!model.copiar()) return false;
        this.avisar(t("editor.shapeCopied"));
        return true;
      },
      aoColarForma: () => {
        if (!model.colar()) return false;
        this.desenhar();
        return true;
      },
      aoDesfazer: mudar(() => model.desfazer()),
      aoRefazer: mudar(() => model.refazerUltimo()),
      aoCopiar: () =>
        copiarTexto(model.svg()).then(
          () => this.avisar(t("editor.copied")),
          () => this.avisar(t("toast.copyBlocked")),
        ),
      aoBaixarSvg: () => {
        baixarSvg(model.svg(), this.arquivo);
        this.avisar(t("toast.downloading", { file: `${this.arquivo}.svg` }));
      },
      aoBaixarPng: async () => {
        // Pergunta o tamanho; o do próprio SVG é a sugestão
        const sugerido = tamanhoDoPng(model.raiz);
        const tamanho = this.escolherTamanhoPng ? await this.escolherTamanhoPng(sugerido) : sugerido;
        if (!tamanho) return;
        baixarPngDeSvg(model.svg(), tamanho, COR_PNG, this.arquivo).then(
          () => this.avisar(t("toast.downloadingPng", { file: `${this.arquivo}.png`, size: tamanho })),
          () => this.avisar(t("toast.pngFailed")),
        );
      },
      aoScratchpad: () => this.aoAdicionar(this.item, model.svg()),
      aoSalvarNoScratchpad: () => {
        if (!this.salvarNoScratchpad) return;
        this.salvarNoScratchpad(model.svg());
        this.view.fechar({ perguntar: false });
      },
      aoSalvarArquivo: () => this.salvarArquivo(),
      aoAbrirArquivo: (arquivo) => this.abrirArquivo(arquivo),
      aoCompartilhar: () => this.compartilhar(),
      // Fechar é de propósito (sem alterações, ou confirmado): o rascunho sai
      aoFechar: () => {
        this.limparEndereco();
        clearTimeout(this.esperaRascunho);
        this.apagarRascunho();
        this.view.mostrarRascunho(null);
      },
      // Houve mudança desde que o ícone foi aberto (fechar pede confirmação)
      temAlteracoes: () => model.podeDesfazer,
    });
    // Link com #svg=… ou #ile=… (feito por uma pessoa ou por uma IA)
    this.abrirDoEndereco();
    window.addEventListener("hashchange", () => this.abrirDoEndereco());
  }

  // Aviso com "Desfazer": só desfaz se nada mudou depois da ação avisada
  avisarDesfazivel(mensagem) {
    const marca = this.model.historico.length;
    this.avisar(mensagem, {
      rotulo: t("editor.undo"),
      fazer: () => {
        if (this.model.historico.length !== marca) return;
        this.model.desfazer();
        this.desenhar();
      },
    });
  }

  // ── Rascunho: a edição em andamento, guardada no navegador ───────────────
  lerRascunho() {
    try {
      const rascunho = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) ?? "null");
      if (!rascunho?.projeto || !(Date.now() - rascunho.quando < VALIDADE_RASCUNHO_MS)) return null;
      return rascunho;
    } catch {
      return null;
    }
  }

  apagarRascunho() {
    try {
      localStorage.removeItem(CHAVE_RASCUNHO);
    } catch {
      // Sem acesso ao armazenamento: não havia rascunho
    }
  }

  // Guarda pouco depois da última mudança (arrastar gera dezenas por segundo)
  agendarRascunho() {
    clearTimeout(this.esperaRascunho);
    this.esperaRascunho = setTimeout(() => {
      if (!this.view.aberto || !this.model.podeDesfazer) return;
      const nome = this.item?.nome || "icon";
      const texto = JSON.stringify({
        quando: Date.now(),
        projeto: this.model.exportarProjeto({ nome, editavel: Boolean(this.item?.editavel) }),
      });
      if (texto.length > TAMANHO_MAXIMO_RASCUNHO) return;
      try {
        localStorage.setItem(CHAVE_RASCUNHO, texto);
      } catch {
        // Armazenamento cheio ou bloqueado: segue sem rascunho
      }
    }, 600);
  }

  // Ao abrir o editor: se há uma edição de antes, diferente desta, oferece
  oferecerRascunho() {
    const rascunho = this.lerRascunho();
    this.rascunhoOferecido = rascunho;
    if (!rascunho) {
      this.view.mostrarRascunho(null);
      return;
    }
    this.view.mostrarRascunho(
      t("editor.draftFound", { name: rascunho.projeto.nome || "icon", when: haQuanto(rascunho.quando) }),
    );
  }

  recuperarRascunho() {
    const rascunho = this.rascunhoOferecido ?? this.lerRascunho();
    this.view.mostrarRascunho(null);
    if (!rascunho) return;
    try {
      const { nome, editavel } = this.model.carregarProjeto(JSON.stringify(rascunho.projeto), { desfazivel: true });
      this.item = { nome, editavel };
      this.sairDaEdicao();
      this.view.abrir(nome);
      this.desenhar();
      this.avisar(t("editor.draftRestored"));
    } catch (erro) {
      this.avisar(tErro(erro));
    }
  }

  // ── Link que abre o editor ───────────────────────────────────────────────
  abrirDoEndereco() {
    let pedido;
    try {
      pedido = lerFragmento(location.hash);
    } catch (erro) {
      this.avisar(tErro(erro));
      return;
    }
    if (!pedido) return;
    if (pedido.conteudo.length > TAMANHO_MAXIMO_ILE) {
      this.avisar(t("editor.linkTooLarge"));
      return;
    }
    try {
      if (pedido.tipo === "svg") {
        const nome = pedido.nome || "icon";
        this.model.carregar(pedido.conteudo, nome, { desfazivel: this.view.aberto });
        this.item = { nome, editavel: false };
        this.sairDaEdicao();
      } else {
        const { nome, editavel } = this.model.carregarProjeto(pedido.conteudo, {
          desfazivel: this.view.aberto,
        });
        this.item = { nome: pedido.nome || nome, editavel };
        this.sairDaEdicao();
      }
      const jaAberto = this.view.aberto;
      this.view.abrir(this.item.nome);
      if (!jaAberto) this.oferecerRascunho();
      this.desenhar();
      this.avisar(t("editor.openedLink"));
    } catch (erro) {
      this.avisar(tErro(erro));
    }
  }

  // Ao fechar o editor, o ícone sai do endereço (recarregar não reabre)
  limparEndereco() {
    if (/(^#|&)(svg|ile)=/.test(location.hash))
      history.replaceState(null, "", location.pathname + location.search);
  }

  compartilhar() {
    const projeto = this.model.exportarProjeto({
      nome: this.item?.nome || "icon",
      editavel: Boolean(this.item?.editavel),
    });
    const link = linkDoProjeto(location.origin + location.pathname, projeto);
    copiarTexto(link).then(
      () => this.avisar(t("editor.linkCopied")),
      () => this.avisar(t("toast.copyBlocked")),
    );
  }

  // ── Arquivo .ile ─────────────────────────────────────────────────────────
  salvarArquivo() {
    const nome = this.item?.nome || "icon";
    const projeto = this.model.exportarProjeto({
      nome,
      editavel: Boolean(this.item?.editavel),
    });
    const arquivo = `${nomeDeArquivo(nome)}.ile`;
    baixarTexto(JSON.stringify(projeto, null, 2), arquivo, "application/json");
    this.avisar(t("editor.saving", { file: arquivo }));
  }

  async abrirArquivo(arquivo) {
    if (!/\.ile$/i.test(arquivo.name)) {
      this.avisar(t("editor.chooseIle"));
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_ILE) {
      this.avisar(t("editor.ileTooLarge"));
      return;
    }
    try {
      const conteudo = await arquivo.text();
      // Com o editor aberto, abrir é desfazível: Undo volta ao trabalho anterior
      const desfazivel = this.view.aberto;
      const { nome, editavel } = this.model.carregarProjeto(conteudo, { desfazivel });
      this.item = { nome, editavel };
      this.sairDaEdicao();
      this.view.abrir(nome);
      if (!desfazivel) this.oferecerRascunho();
      this.desenhar();
      this.avisar(t("editor.opened", { file: arquivo.name }));
    } catch (erro) {
      this.avisar(tErro(erro));
    }
  }

  // O que está no editor agora, para publicar na Iconlibrary
  atual() {
    return { svg: this.model.svg(), nome: this.item?.nome || "", edicao: this.edicao ?? null };
  }

  // ── Editar um ícone publicado na Iconlibrary ("Meus ícones") ─────────────
  // dados: { id, nome, svg, categorias, autor, codigo }. Publicar, depois,
  // envia como edição desse ícone, já com nome, categorias e crédito.
  abrirEdicao(dados) {
    this.abrir({ nome: dados.nome, editavel: false }, dados.svg);
    this.edicao = { id: dados.id, nome: dados.nome, categorias: dados.categorias, autor: dados.autor, codigo: dados.codigo };
    this.view.mostrarEdicao(true);
  }

  sairDaEdicao() {
    this.edicao = null;
    this.view.mostrarEdicao(false);
    this.salvarNoScratchpad = null;
    this.view.mostrarSalvarScratchpad(false);
  }

  // Ícone aberto a partir da grade do scratchpad: "Salvar no scratchpad"
  // devolve a versão editada (salvar(svg)) e fecha o editor
  abrirDoScratchpad(nome, svg, salvar) {
    this.abrir({ nome, editavel: false }, svg);
    if (!this.view.aberto) return;
    this.salvarNoScratchpad = salvar;
    this.view.mostrarSalvarScratchpad(true);
  }

  get arquivo() {
    return `${nomeDeArquivo(this.item?.nome || "icon")}-edited`;
  }

  // Abre o editor com o SVG do card (já com o tamanho, traço e cor escolhidos)
  abrir(item, svg) {
    this.item = item;
    this.sairDaEdicao();
    try {
      this.model.carregar(svg, item.nome);
    } catch (erro) {
      this.avisar(tErro(erro));
      return;
    }
    const jaAberto = this.view.aberto;
    this.view.abrir(item.nome);
    if (!jaAberto) this.oferecerRascunho();
    this.desenhar();
  }

  // ── Outro ícone por cima ─────────────────────────────────────────────────
  async buscar(chave, termo) {
    // Só a busca mais recente vai para a tela
    const minha = ++this.buscaAtual;
    this.view.mostrarResultados(t("loading.set", { set: this.catalogo.rotulo(chave) }));
    try {
      const itens = await this.catalogo.buscar(chave, termo);
      if (minha !== this.buscaAtual) return;
      this.resultados = itens;
      this.view.mostrarResultados(
        itens.length
          ? itens.map((item) => ({ nome: item.nome, svg: item.svg }))
          : t("editor.noIcon"),
      );
    } catch (erro) {
      if (minha === this.buscaAtual)
        this.view.mostrarResultados(t("editor.loadFailed", { message: tErro(erro) }));
    }
  }

  importar(k) {
    const item = this.resultados[k];
    if (!item) return;
    try {
      const fixos = this.model.importar(this.catalogo.svg(item), item.nome);
      this.desenhar();
      this.avisar(
        fixos
          ? t("editor.addedFixed", { name: item.nome, n: fixos })
          : t("editor.added", { name: item.nome }),
      );
    } catch (erro) {
      this.avisar(tErro(erro));
    }
  }

  aplicarCodigo(texto) {
    try {
      this.model.aplicarCodigo(texto);
      // O texto do usuário fica como ele digitou
      this.desenhar({ atualizarCodigo: false });
      this.view.mostrarErro("");
    } catch (erro) {
      this.view.mostrarErro(tErro(erro));
    }
  }

  desenhar({ atualizarCodigo = true } = {}) {
    const { model } = this;
    const svg = model.svg();
    const { w, h } = model.viewBox;
    // O Lucide Studio só edita ícones de traço 24×24, de um estilo só
    const linkStudio =
      this.item?.editavel && w === 24 && h === 24 && !model.misturado
        ? linkDoStudio({ ...this.item, svg })
        : null;
    this.view.mostrar(
      {
        raiz: model.raiz,
        elementos: model.elementos,
        selecionado: model.selecionado,
        selecionados: new Set(model.temSelecao ? model.alvos() : []),
        grupoSelecionado: model.grupoSelecionado,
        grupos: model.gruposEmUso(),
        estiloSelecao: model.estiloDaSelecao(),
        degrade: model.degradeDaSelecao(),
        podeDegradeFill: model.podeDegrade("fill"),
        podeDegradeStroke: model.podeDegrade("stroke"),
        pontos: model.pontosSelecionados(),
        pontoSelecionado: model.pontoSelecionado,
        // Só faz sentido com uma forma que tem pontos de traço (não círculo…)
        editaPontos: model.pontosSelecionados().some((p) => p.tipo === "end") &&
          ["path", "line", "polyline", "polygon"].includes(model.elementos[model.selecionado]?.tag),
        podeRemoverPonto: model.podeRemoverPonto,
        podeAdicionarPonto: model.podeAdicionarPonto,
        fora: model.pontosForaDaArea(),
        viewBox: model.viewBox,
        svg,
        passo: model.passo,
        podeDesfazer: model.podeDesfazer,
        podeRefazer: model.podeRefazer,
        linkStudio,
        quantidade: model.quantidade,
        caixa: model.quantidade > 1 ? model.limitesDe(model.alvos()) : null,
        caixaSelecao: model.temSelecao ? model.caixaDaSelecao() : null,
        guias: model.guias,
        original: model.original,
        podeAgrupar: model.podeAgrupar,
        podeDesagrupar: model.podeDesagrupar,
        podeUnir: model.podeUnir,
        linhaAberta: model.linhaAberta,
        podePreencher: model.podePreencher,
        preenchida: model.preenchida,
        blocos: model.blocosDasCamadas(),
        ligacao: model.ligacaoDaUniao,
        uniaoDaForma: model.uniaoDaForma,
        podeSeparar: model.podeSeparar,
      },
      { atualizarCodigo },
    );
    this.agendarRascunho();
  }
}
