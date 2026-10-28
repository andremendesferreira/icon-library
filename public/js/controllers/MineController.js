import { t } from "../i18n/i18n.js";

// Erros da API (scripts/iconlibrary.js) → mensagens
const MENSAGENS = {
  not_supporter: "publish.notSupporter",
  too_many: "coffee.tooMany",
  disabled: "publish.disabled",
};

// "Meus ícones": quem publicou na Iconlibrary vê os próprios ícones (pelo
// código de apoiador) e abre um deles no editor para enviar uma edição.
export class MineController {
  icones = [];

  // apoiador: SupporterModel; aoEditar({ id, nome, svg, categorias, autor })
  constructor(view, { apoiador, aoEditar }) {
    this.view = view;
    this.apoiador = apoiador;
    this.aoEditarIcone = aoEditar;
    view.aoAbrir(() => this.abrir());
    view.aoBuscar((codigo) => this.buscar(codigo));
    view.aoEditar((id) => this.editar(id));
  }

  abrir() {
    const codigo = this.apoiador.ativo()?.code;
    this.view.abrir(codigo);
    // Com o código deste navegador, a lista já vem
    if (codigo) this.buscar(codigo);
  }

  async buscar(codigo) {
    const { view } = this;
    view.mostrarSituacao(t("mine.loading"));
    try {
      const res = await fetch("api/iconlibrary/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codigo }),
      });
      const resposta = await res.json().catch(() => ({}));
      if (!res.ok) {
        view.mostrarIcones([]);
        view.mostrarSituacao(t(MENSAGENS[resposta.error] ?? "coffee.error"), "erro");
        return;
      }
      this.codigo = codigo;
      this.icones = resposta.icons ?? [];
      view.mostrarIcones(this.icones);
    } catch {
      view.mostrarSituacao(t("coffee.error"), "erro");
    }
  }

  // Abre no editor a versão mais recente: a edição pendente, se houver
  editar(id) {
    const icone = this.icones.find((i) => i.id === id);
    if (!icone) return;
    const atual = icone.revision ?? icone;
    this.view.fechar();
    this.aoEditarIcone({
      id: icone.id,
      nome: atual.name,
      svg: atual.svg,
      categorias: atual.categories,
      autor: atual.author ?? "",
      codigo: this.codigo,
    });
  }
}
