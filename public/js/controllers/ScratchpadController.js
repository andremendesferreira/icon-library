import { copiarTexto } from "./clipboard.js";

export class ScratchpadController {
  constructor(model, view, avisar) {
    this.model = model;
    this.view = view;
    this.avisar = avisar;
  }

  iniciar() {
    const { model, view } = this;
    view.mostrarTexto(model.texto);
    view.aoAlternar(() => view.abrir(!view.aberto, { focar: true }));
    view.aoFechar(() => view.abrir(false));
    view.aoEditar((texto) => model.definir(texto));
    view.aoLimpar(() => {
      model.limpar();
      view.mostrarTexto("");
      view.focar();
    });
    view.aoCopiar(() => {
      if (!model.texto.trim()) return this.avisar("Scratchpad is empty");
      copiarTexto(model.texto).then(() => this.avisar("Scratchpad copied"));
    });
  }

  // Botão "+" de um card: acrescenta o ícone (svg já com tamanho, traço e cor
  // escolhidos) e abre a gaveta se estiver fechada
  adicionar(item, svg) {
    this.model.adicionar(item.nome, svg);
    this.view.mostrarTexto(this.model.texto, { rolarAoFim: true });
    if (!this.view.aberto) this.view.abrir(true);
    this.avisar(`Added to scratchpad: ${item.nome}`);
  }
}
