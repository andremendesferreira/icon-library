import { nomeDeArquivo, paraReact } from "../models/svgTools.js";
import { copiarTexto } from "./clipboard.js";
import { t, tErro } from "../i18n/i18n.js";
import { baixarPngDeEmoji, baixarPngDeSvg, baixarSvg } from "./download.js";

// Cor de "currentColor" num PNG solto, onde não há texto para herdar a cor
const COR_PNG = "#2c3e50";

// Liga a view ao model: recebe as ações do usuário, atualiza o estado e manda
// redesenhar.
export class IconController {
  // aoAdicionar(item, svg): botão "+" de um card (envia o ícone ao scratchpad)
  // aoEditar(item, svg): lápis de um card (abre o editor)
  constructor(model, view, { aoAdicionar, aoEditar }) {
    this.model = model;
    this.view = view;
    this.aoAdicionar = aoAdicionar;
    this.aoEditar = aoEditar;
  }

  iniciar() {
    const { model, view } = this;
    view.aoFiltrar(() => {
      this.aplicarFiltros();
      this.salvarNoEndereco();
    });
    view.aoEscolherFonte((chave) => this.escolherFonte(chave));
    view.aoAlternarGrupo((grupo, marcado) => {
      model.alternarGrupo(grupo, marcado);
      this.atualizarGrupos();
    });
    view.aoLimparGrupos(() => {
      model.limparGrupos();
      view.desmarcarGrupos();
      this.atualizarGrupos();
    });
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
  lerDoEndereco() {
    const parametros = new URLSearchParams(location.search);
    const chave = parametros.get("set");
    if (!chave || !Object.hasOwn(this.model.fontes, chave)) return;
    this.view.busca = parametros.get("q") || "";
    this.escolherFonte(chave, { focar: false });
  }

  salvarNoEndereco() {
    const parametros = new URLSearchParams();
    // Um ?lang= de quem chegou por link (ou buscador) fica no endereço
    const idioma = new URLSearchParams(location.search).get("lang");
    if (idioma) parametros.set("lang", idioma);
    if (this.model.fonteAtual) parametros.set("set", this.model.fonteAtual);
    const busca = this.view.busca.trim();
    if (busca) parametros.set("q", busca);
    const consulta = parametros.toString();
    // replaceState: digitar não enche o histórico do navegador. O "#…"
    // fica: pode ser um ícone aberto no editor por link (#svg=…)
    history.replaceState(
      null,
      "",
      (consulta ? `?${consulta}` : location.pathname) + location.hash,
    );
  }

  escolherFonte(chave, { focar = true } = {}) {
    this.view.marcarFonte(chave, this.model.fontes[chave].rotulo, { focar });
    if (chave !== this.model.fonteAtual) this.trocarFonte(chave);
  }

  async trocarFonte(chave) {
    const { model, view } = this;
    model.fonteAtual = chave;
    this.salvarNoEndereco();
    try {
      if (!model.emCache(chave))
        view.mostrarCarregando(model.fontes[chave].rotulo);
      const dados = await model.carregar(chave);
      // O usuário trocou de conjunto enquanto este carregava
      if (chave !== model.fonteAtual) return;

      model.exibir(chave, dados);
      view.mostrarFiltroSuporte(model.detectaGlifo);
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
    });
    this.view.renderGrid(grupos, {
      aoClicar: (item) => this.copiarPrincipal(item),
      aoClicarDireito: (item) => this.copiarAlternativa(item),
      aoAdicionar: (item) => this.aoAdicionar(item, this.model.svgFinal(item)),
      aoMenu: (acao, item) => this.executarMenu(acao, item),
      aoEditar: (item) => this.aoEditar(item, this.model.svgFinal(item)),
      // Conjunto sem nenhum ícone (Iconlibrary no começo): mensagem própria
      vazio: this.model.itens.length ? null : this.model.fonteExibida?.vazio,
    });
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
  executarMenu(acao, item) {
    const svg = this.model.svgFinal(item);
    const arquivo = nomeDeArquivo(item.nome);
    const { tamanho, cor } = this.model.estilo;
    if (acao === "svg") {
      baixarSvg(svg, arquivo);
      this.view.mostrarToast(t("toast.downloading", { file: `${arquivo}.svg` }));
    } else if (acao === "png") {
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
    }
  }

  copiar(texto, mensagem) {
    copiarTexto(texto).then(
      () => this.view.mostrarToast(mensagem),
      () => this.view.mostrarToast(t("toast.copyBlocked")),
    );
  }
}
