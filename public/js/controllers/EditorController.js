import { TAMANHO_MAXIMO_ILE } from "../models/EditorModel.js";
import { linkDoStudio } from "../models/IconModel.js";
import { lerFragmento, linkDoProjeto } from "../models/linkCodec.js";
import { nomeDeArquivo } from "../models/svgTools.js";
import { copiarTexto } from "./clipboard.js";
import { t, tErro } from "../i18n/i18n.js";
import { baixarPngDeSvg, baixarSvg, baixarTexto } from "./download.js";

// Cor de "currentColor" num PNG solto, onde não há texto para herdar a cor
const COR_PNG = "#2c3e50";

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
      aoIniciarArraste: () => model.iniciarArraste(),
      aoArrastarPonto: mudar((id, x, y) => model.arrastarPonto(id, x, y)),
      aoArrastarElemento: mudar((dx, dy) => model.arrastarElemento(dx, dy)),
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
        model.remover(i);
        this.desenhar();
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
      aoTransformar: (operacao) => {
        const fixos = model.transformar(operacao);
        this.desenhar();
        if (fixos)
          this.avisar(t("editor.codeOnlyChanged", { n: fixos }));
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
        const sugerido = parseInt(model.raiz.width, 10) || 24;
        const tamanho = this.escolherTamanhoPng ? await this.escolherTamanhoPng(sugerido) : sugerido;
        if (!tamanho) return;
        baixarPngDeSvg(model.svg(), tamanho, COR_PNG, this.arquivo).then(
          () => this.avisar(t("toast.downloadingPng", { file: `${this.arquivo}.png`, size: tamanho })),
          () => this.avisar(t("toast.pngFailed")),
        );
      },
      aoScratchpad: () => this.aoAdicionar(this.item, model.svg()),
      aoSalvarArquivo: () => this.salvarArquivo(),
      aoAbrirArquivo: (arquivo) => this.abrirArquivo(arquivo),
      aoCompartilhar: () => this.compartilhar(),
      aoFechar: () => this.limparEndereco(),
      // Houve mudança desde que o ícone foi aberto (fechar pede confirmação)
      temAlteracoes: () => model.podeDesfazer,
    });
    // Link com #svg=… ou #ile=… (feito por uma pessoa ou por uma IA)
    this.abrirDoEndereco();
    window.addEventListener("hashchange", () => this.abrirDoEndereco());
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
      } else {
        const { nome, editavel } = this.model.carregarProjeto(pedido.conteudo, {
          desfazivel: this.view.aberto,
        });
        this.item = { nome: pedido.nome || nome, editavel };
      }
      this.view.abrir(this.item.nome);
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
      this.view.abrir(nome);
      this.desenhar();
      this.avisar(t("editor.opened", { file: arquivo.name }));
    } catch (erro) {
      this.avisar(tErro(erro));
    }
  }

  // O que está no editor agora, para publicar na Iconlibrary
  atual() {
    return { svg: this.model.svg(), nome: this.item?.nome || "" };
  }

  get arquivo() {
    return `${nomeDeArquivo(this.item?.nome || "icon")}-edited`;
  }

  // Abre o editor com o SVG do card (já com o tamanho, traço e cor escolhidos)
  abrir(item, svg) {
    this.item = item;
    try {
      this.model.carregar(svg, item.nome);
    } catch (erro) {
      this.avisar(tErro(erro));
      return;
    }
    this.view.abrir(item.nome);
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
      },
      { atualizarCodigo },
    );
  }
}
