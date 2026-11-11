import { nomeDeArquivo, paraCss, paraDataUri, paraReact, paraSvelte, paraVue } from "../models/svgTools.js";
import { copiarTexto } from "./clipboard.js";
import { t, tErro } from "../i18n/i18n.js";
import { baixarPngDeEmoji, baixarPngDeSvg, baixarSvg } from "./download.js";

// Cor de "currentColor" num PNG solto, onde não há texto para herdar a cor
const COR_PNG = "#2c3e50";

// Sem ?set= no endereço, a página abre o último conjunto escolhido (guardado
// no navegador) ou este
const CONJUNTO_PADRAO = "lucide";
const CHAVE_CONJUNTO = "icon-library:set";

// Liga a view ao model: recebe as ações do usuário, atualiza o estado e manda
// redesenhar.
export class IconController {
  // aoAdicionar(item, svg): botão "+" de um card (envia o ícone ao scratchpad)
  // aoEditar(item, svg): lápis de um card (abre o editor)
  // escolherTamanhoPng(sugerido): pergunta o tamanho do PNG (null = desistiu)
  constructor(model, view, { aoAdicionar, aoEditar, escolherTamanhoPng }) {
    this.model = model;
    this.view = view;
    this.aoAdicionar = aoAdicionar;
    this.aoEditar = aoEditar;
    this.escolherTamanhoPng = escolherTamanhoPng;
  }

  iniciar() {
    const { model, view } = this;
    view.aoFiltrar(() => {
      this.aplicarFiltros();
      this.salvarNoEndereco();
    });
    view.aoEscolherFonte((chave) => {
      this.escolherFonte(chave);
      try {
        localStorage.setItem(CHAVE_CONJUNTO, chave);
      } catch {
        // Sem armazenamento: a próxima visita abre o padrão
      }
    });
    view.aoAlternarGrupo((grupo, marcado) => {
      model.alternarGrupo(grupo, marcado);
      this.atualizarGrupos();
    });
    view.aoLimparGrupos(() => this.limparGrupos());
    view.aoMudarEstilo((mudancas) => {
      model.definirEstilo(mudancas);
      view.mostrarEstilo(model.estilo);
    });
    view.aoRestaurarEstilo(() => {
      model.restaurarEstilo();
      view.mostrarEstilo(model.estilo);
    });
    view.estadoInicial(model.fontes);
    view.mostrarEstilo(model.estilo);
    view.habilitarEstilo({ traco: false, cor: false });
    this.lerDoEndereco();
  }

  // ── Estado no endereço (?set=lucide&q=heart) ───────────────────────────────
  // Uma busca pode ser compartilhada ou salva nos favoritos
  // Sem conjunto no endereço, abre o último escolhido ou o Lucide, sem
  // escrever ?set= no endereço: a home continua sendo "/" até a pessoa mexer
  lerDoEndereco() {
    const parametros = new URLSearchParams(location.search);
    const pedido = parametros.get("set");
    const valido = (chave) => chave && Object.hasOwn(this.model.fontes, chave);
    this.view.variante = { outline: "contorno", filled: "preenchido" }[parametros.get("style")] ?? "todos";
    if (valido(pedido)) {
      this.view.busca = parametros.get("q") || "";
      this.escolherFonte(pedido, { focar: false });
      return;
    }
    // ?q= sem conjunto (a busca das páginas de texto): o padrão, já filtrado
    this.view.busca = parametros.get("q") || "";
    let salvo = null;
    try {
      salvo = localStorage.getItem(CHAVE_CONJUNTO);
    } catch {
      // Sem armazenamento: vale o padrão
    }
    this.escolherFonte(valido(salvo) ? salvo : CONJUNTO_PADRAO, { focar: false, implicito: true });
  }

  limparGrupos() {
    this.model.limparGrupos();
    this.view.desmarcarGrupos();
    this.atualizarGrupos();
  }

  salvarNoEndereco() {
    const parametros = new URLSearchParams();
    // Um ?lang= de quem chegou por link (ou buscador) fica no endereço
    const idioma = new URLSearchParams(location.search).get("lang");
    if (idioma) parametros.set("lang", idioma);
    if (this.model.fonteAtual) parametros.set("set", this.model.fonteAtual);
    const busca = this.view.busca.trim();
    if (busca) parametros.set("q", busca);
    // O conjunto escolhido, não o exibido: este ainda pode estar carregando
    const comVariantes = this.model.fontes[this.model.fonteAtual]?.temVariantes;
    const estilo = comVariantes ? { contorno: "outline", preenchido: "filled" }[this.view.variante] : null;
    if (estilo) parametros.set("style", estilo);
    const consulta = parametros.toString();
    // replaceState: digitar não enche o histórico do navegador. O "#…"
    // fica: pode ser um ícone aberto no editor por link (#svg=…)
    history.replaceState(
      null,
      "",
      (consulta ? `?${consulta}` : location.pathname) + location.hash,
    );
  }

  escolherFonte(chave, { focar = true, implicito = false } = {}) {
    this.view.marcarFonte(chave, this.model.fontes[chave].rotulo, { focar });
    if (chave !== this.model.fonteAtual) this.trocarFonte(chave, { implicito });
  }

  // implicito: o conjunto padrão da primeira visita, que não vai para o endereço
  async trocarFonte(chave, { implicito = false } = {}) {
    const { model, view } = this;
    model.fonteAtual = chave;
    if (!implicito) this.salvarNoEndereco();
    try {
      if (!model.emCache(chave))
        view.mostrarCarregando(model.fontes[chave].rotulo);
      const dados = await model.carregar(chave);
      // O usuário trocou de conjunto enquanto este carregava
      if (chave !== model.fonteAtual) return;

      model.exibir(chave, dados);
      view.mostrarFiltroSuporte(model.detectaGlifo);
      view.mostrarFiltroVariante(model.temVariantes);
      view.habilitarEstilo(model.personalizavel);
      view.renderGrupos(model.contarGrupos());
      view.renderResumo(model.resumo());
      view.esconderCarregando();
      this.atualizarGrupos();
    } catch (erro) {
      if (chave !== model.fonteAtual) return;
      view.mostrarErro(tErro(erro));
    }
  }

  atualizarGrupos() {
    this.view.atualizarRotuloGrupos(
      this.model.gruposEscolhidos,
      t(this.model.rotuloTodos),
    );
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    const grupos = this.model.filtrar({
      busca: this.view.busca,
      apenasSuportados: this.view.apenasSuportados,
      variante: this.view.variante,
    });
    this.view.renderGrid(grupos, {
      aoClicar: (item) => this.copiarPrincipal(item),
      aoClicarDireito: (item) => this.copiarAlternativa(item),
      aoAdicionar: (item) => this.aoAdicionar(item, this.model.svgFinal(item)),
      aoMenu: (acao, item) => this.executarMenu(acao, item),
      aoEditar: (item) => this.aoEditar(item, this.model.svgFinal(item)),
      // Conjunto sem nenhum ícone (Iconlibrary no começo): mensagem própria
      vazio: this.model.itens.length ? null : this.model.fonteExibida?.vazio,
      semResultado: this.semResultado(),
      aoLimparBusca: () => {
        this.view.busca = "";
        this.aplicarFiltros();
        this.salvarNoEndereco();
        this.view.focarBusca();
      },
      aoLimparGrupos: () => this.limparGrupos(),
      aoProcurarEm: (chave) => this.escolherFonte(chave),
    });
  }

  // Busca sem resultado: o que dá para fazer (limpar a busca, as categorias,
  // procurar nos outros conjuntos, com a contagem dos que já foram baixados)
  semResultado() {
    const { model, view } = this;
    if (!model.itens.length) return null;
    const busca = view.busca.trim();
    return {
      busca,
      comGrupos: model.gruposEscolhidos.size > 0,
      outros: busca
        ? Object.entries(model.fontes)
            .filter(([chave]) => chave !== model.fonteAtual)
            .map(([chave, fonte]) => ({ chave, rotulo: fonte.rotulo, n: model.contarEm(chave, busca) }))
            .filter((outro) => outro.n !== 0)
        : [],
    };
  }

  copiarPrincipal(item) {
    if (item.tipo === "svg") this.copiar(this.model.svgFinal(item), t("toast.svgCopied"));
    else
      this.copiar(
        item.char,
        item.suportado
          ? t("toast.emojiCopied", { char: item.char })
          : t("toast.emojiNoGlyph", { version: item.versao }),
      );
  }

  copiarAlternativa(item) {
    if (item.tipo === "svg")
      this.copiar(item.nome, t("toast.nameCopied", { name: item.nome }));
    else
      this.copiar(
        this.model.svgFinal(item),
        t("toast.emojiSvgCopied"),
      );
  }

  // Opções do menu "⋯" de um card
  async executarMenu(acao, item) {
    const svg = this.model.svgFinal(item);
    const arquivo = nomeDeArquivo(item.nome);
    const { cor } = this.model.estilo;
    let { tamanho } = this.model.estilo;
    if (acao === "svg") {
      baixarSvg(svg, arquivo);
      this.view.mostrarToast(t("toast.downloading", { file: `${arquivo}.svg` }));
    } else if (acao === "png") {
      // Pergunta o tamanho; o do controle "Tamanho" é a sugestão
      if (this.escolherTamanhoPng) tamanho = await this.escolherTamanhoPng(tamanho);
      if (!tamanho) return;
      const baixando =
        item.tipo === "emoji"
          ? baixarPngDeEmoji(item.char, tamanho, arquivo)
          : baixarPngDeSvg(svg, tamanho, cor || COR_PNG, arquivo);
      baixando.then(
        () => this.view.mostrarToast(t("toast.downloadingPng", { file: `${arquivo}.png`, size: tamanho })),
        () => this.view.mostrarToast(t("toast.pngFailed")),
      );
    } else if (acao === "react") {
      this.copiar(paraReact(svg, item.nome), t("toast.reactCopied"));
    } else if (acao === "vue") {
      this.copiar(paraVue(svg), t("toast.vueCopied"));
    } else if (acao === "svelte") {
      this.copiar(paraSvelte(svg), t("toast.svelteCopied"));
    } else if (acao === "dataUri") {
      this.copiar(paraDataUri(svg, cor || COR_PNG), t("toast.dataUriCopied"));
    } else if (acao === "css") {
      this.copiar(paraCss(svg, item.nome, { mascara: item.tipo === "svg", tamanho }), t("toast.cssCopied"));
    }
  }

  copiar(texto, mensagem) {
    copiarTexto(texto).then(
      () => this.view.mostrarToast(mensagem),
      () => this.view.mostrarToast(t("toast.copyBlocked")),
    );
  }
}
