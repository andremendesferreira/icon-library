import { t } from "../i18n/i18n.js";

// Erros da API (scripts/iconlibrary.js) → mensagens
const MENSAGENS = {
  not_supporter: "publish.notSupporter",
  name_taken: "publish.nameTaken",
  bad_name: "publish.badName",
  bad_categories: "publish.badCategories",
  bad_author: "publish.badAuthor",
  license_required: "publish.licenseRequired",
  too_many_pending: "publish.tooManyPending",
  svg_shapes: "publish.svgShapes",
  svg_attribute: "publish.svgShapes",
  svg_too_large: "publish.svgLarge",
  svg_invalid: "publish.svgInvalid",
  svg_empty: "publish.svgInvalid",
  too_many: "coffee.tooMany",
  too_large: "publish.svgLarge",
  disabled: "publish.disabled",
};

// Publicar o ícone do editor na Iconlibrary, a fonte da comunidade: só para
// apoiadores, e tudo passa pela moderação antes de aparecer.
export class PublishController {
  maximo = 3;

  // icone(): { svg, nome } do editor; apoiador: SupporterModel; abrirCafe(): janela do café
  constructor(view, { icone, apoiador, abrirCafe }) {
    this.view = view;
    this.icone = icone;
    this.apoiador = apoiador;
    view.aoAbrir(() => this.abrir());
    view.aoEnviar((dados) => this.enviar(dados));
    view.aoPagarCafe(abrirCafe);
  }

  // O botão "Publicar" só aparece com a Iconlibrary ligada no servidor
  async iniciar() {
    try {
      const res = await fetch("api/iconlibrary/config");
      const config = res.ok ? await res.json() : { enabled: false };
      if (!config.enabled) return;
      this.maximo = config.maxCategories;
      const lista = await (await fetch("json/iconlibrary-categories.json")).json();
      this.view.preparar(lista, this.maximo);
      this.view.mostrarBotao(true);
    } catch {
      // Sem servidor (ou offline): sem publicação, o resto segue normal
    }
  }

  abrir() {
    const { svg, nome } = this.icone();
    this.view.abrir({ svg, nome, codigo: this.apoiador.ativo()?.code });
  }

  async enviar(dados) {
    const { view } = this;
    if (!dados.license) return view.mostrarSituacao(t("publish.licenseRequired"), "erro");
    view.travar(true);
    view.mostrarSituacao(t("publish.sending"));
    try {
      const res = await fetch("api/iconlibrary/icons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dados, svg: this.icone().svg }),
      });
      const resposta = await res.json().catch(() => ({}));
      if (!res.ok) {
        const chave = MENSAGENS[resposta.error] ?? "coffee.error";
        view.mostrarSituacao(t(chave, { n: resposta.max ?? this.maximo }), "erro");
        view.travar(false);
        return;
      }
      view.mostrarSituacao(t("publish.sent", { name: dados.name.trim() }), "ok");
    } catch {
      view.mostrarSituacao(t("coffee.error"), "erro");
      view.travar(false);
    }
  }
}
