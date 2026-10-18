import { linkDoStudio } from "../models/IconModel.js";
import { nomeDeArquivo, paraReact } from "../models/svgTools.js";
import { copiarTexto } from "./clipboard.js";
import { baixarPngDeEmoji, baixarPngDeSvg, baixarSvg } from "./download.js";

// Cor de "currentColor" num PNG solto, onde não há texto para herdar a cor
const COR_PNG = "#2c3e50";

// Liga a view ao model: recebe as ações do usuário, atualiza o estado e manda
// redesenhar.
export class IconController {
  // aoAdicionar(item, svg): botão "+" de um card (envia o ícone ao scratchpad)
  constructor(model, view, { aoAdicionar }) {
    this.model = model;
    this.view = view;
    this.aoAdicionar = aoAdicionar;
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
    if (this.model.fonteAtual) parametros.set("set", this.model.fonteAtual);
    const busca = this.view.busca.trim();
    if (busca) parametros.set("q", busca);
    const consulta = parametros.toString();
    // replaceState: digitar não enche o histórico do navegador
    history.replaceState(
      null,
      "",
      consulta ? `?${consulta}` : location.pathname,
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
      view.mostrarErro(erro.message);
    }
  }

  atualizarGrupos() {
    this.view.atualizarRotuloGrupos(
      this.model.gruposEscolhidos,
      this.model.rotuloTodos,
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
      linkDeEdicao: linkDoStudio,
    });
  }

  copiarPrincipal(item) {
    if (item.tipo === "svg") this.copiar(this.model.svgFinal(item), "SVG copied");
    else
      this.copiar(
        item.char,
        item.suportado
          ? `Copied: ${item.char}`
          : `Copied, but no image in this font (Emoji ${item.versao})`,
      );
  }

  copiarAlternativa(item) {
    if (item.tipo === "svg")
      this.copiar(item.nome, `Name copied: ${item.nome}`);
    else
      this.copiar(
        this.model.svgFinal(item),
        "SVG copied (still relies on the font to render)",
      );
  }

  // Opções do menu "⋯" de um card
  executarMenu(acao, item) {
    const svg = this.model.svgFinal(item);
    const arquivo = nomeDeArquivo(item.nome);
    const { tamanho, cor } = this.model.estilo;
    if (acao === "svg") {
      baixarSvg(svg, arquivo);
      this.view.mostrarToast(`Downloading ${arquivo}.svg`);
    } else if (acao === "png") {
      const baixando =
        item.tipo === "emoji"
          ? baixarPngDeEmoji(item.char, tamanho, arquivo)
          : baixarPngDeSvg(svg, tamanho, cor || COR_PNG, arquivo);
      baixando.then(
        () => this.view.mostrarToast(`Downloading ${arquivo}.png (${tamanho}px)`),
        () => this.view.mostrarToast("Could not create the PNG"),
      );
    } else if (acao === "react") {
      this.copiar(paraReact(svg, item.nome), "React component copied");
    }
  }

  copiar(texto, mensagem) {
    copiarTexto(texto).then(
      () => this.view.mostrarToast(mensagem),
      () => this.view.mostrarToast("Copy blocked: the page needs https or localhost"),
    );
  }
}
