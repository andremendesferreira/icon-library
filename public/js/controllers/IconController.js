// Liga a view ao model: recebe as ações do usuário, atualiza o estado e manda
// redesenhar.
export class IconController {
  constructor(model, view) {
    this.model = model;
    this.view = view;
  }

  iniciar() {
    const { view } = this;
    view.aoFiltrar(() => this.aplicarFiltros());
    view.aoEscolherFonte((chave) => this.escolherFonte(chave));
    view.aoAlternarGrupo((grupo, marcado) => {
      this.model.alternarGrupo(grupo, marcado);
      this.atualizarGrupos();
    });
    view.aoLimparGrupos(() => {
      this.model.limparGrupos();
      view.desmarcarGrupos();
      this.atualizarGrupos();
    });
    view.estadoInicial(this.model.fontes);
  }

  escolherFonte(chave) {
    this.view.marcarFonte(chave, this.model.fontes[chave].rotulo);
    if (chave !== this.model.fonteAtual) this.trocarFonte(chave);
  }

  async trocarFonte(chave) {
    const { model, view } = this;
    model.fonteAtual = chave;
    try {
      if (!model.emCache(chave))
        view.mostrarCarregando(model.fontes[chave].rotulo);
      const dados = await model.carregar(chave);
      // O usuário trocou de conjunto enquanto este carregava
      if (chave !== model.fonteAtual) return;

      model.exibir(chave, dados);
      view.mostrarFiltroSuporte(model.detectaGlifo);
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
    });
  }

  copiarPrincipal(item) {
    if (item.tipo === "svg") this.copiar(item.svg, "SVG copied");
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
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="24" height="24"><text y=".9em" font-size="90">${item.char}</text></svg>`,
        "SVG copied (still relies on the font to render)",
      );
  }

  copiar(texto, mensagem) {
    navigator.clipboard
      .writeText(texto)
      .then(() => this.view.mostrarToast(mensagem));
  }
}
