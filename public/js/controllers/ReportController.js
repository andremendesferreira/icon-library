import { idiomaAtual, t } from "../i18n/i18n.js";
import { linkDoGithub, paginaDoRelato } from "../models/reportLink.js";

// Erros da API (scripts/reports.js) → mensagens
const MENSAGENS = {
  too_short: "report.tooShort",
  too_long: "report.tooLong",
  bad_email: "report.badEmail",
  too_many: "coffee.tooMany",
  too_large: "report.tooLong",
  disabled: "report.disabled",
  full: "report.disabled",
};

// "Reportar bug" no rodapé: o relato vai para o servidor (lido em /admin) ou,
// para quem prefere, vira um issue no GitHub.
export class ReportController {
  minimo = 10;
  maximo = 2000;

  // avisar(mensagem): aviso na tela
  constructor(view, { avisar }) {
    this.view = view;
    this.avisar = avisar;
    view.aoAbrir(() => view.abrir());
    view.aoEnviar((dados) => this.enviar(dados));
    view.aoAbrirGithub((mensagem) => linkDoGithub(mensagem, this.contexto()));
  }

  async iniciar() {
    let config = { enabled: false };
    try {
      const res = await fetch("api/reports/config");
      if (res.ok) config = await res.json();
    } catch {
      // Sem servidor (ou offline): fica só o link para o GitHub
    }
    if (config.enabled) {
      this.minimo = config.minMessage ?? this.minimo;
      this.maximo = config.maxMessage ?? this.maximo;
    }
    this.view.preparar({ disponivel: config.enabled });
    if (!config.enabled) this.view.mostrarSituacao(t("report.disabled"));
    // Link vindo das outras páginas do site (guia, sobre…): …/#report
    if (location.hash === "#report") {
      history.replaceState(null, "", location.pathname + location.search);
      this.view.abrir();
      if (!config.enabled) this.view.mostrarSituacao(t("report.disabled"));
    }
  }

  // O que vai junto com o relato, para dar para reproduzir o bug
  contexto() {
    return {
      page: paginaDoRelato(location.href),
      lang: idiomaAtual(),
      browser: navigator.userAgent,
      screen: `${window.innerWidth}×${window.innerHeight}`,
    };
  }

  async enviar({ message, email, website }) {
    const { view } = this;
    const texto = message.trim();
    if (texto.length < this.minimo) return view.mostrarSituacao(t("report.tooShort", { n: this.minimo }), "erro");
    if (texto.length > this.maximo) return view.mostrarSituacao(t("report.tooLong", { n: this.maximo }), "erro");
    view.travar(true);
    view.mostrarSituacao(t("report.sending"));
    try {
      const res = await fetch("api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: texto, email: email.trim(), website, ...this.contexto() }),
      });
      const resposta = await res.json().catch(() => ({}));
      if (!res.ok) {
        const chave = MENSAGENS[resposta.error] ?? "coffee.error";
        view.mostrarSituacao(t(chave, { n: chave === "report.tooShort" ? this.minimo : this.maximo }), "erro");
        view.travar(false);
        return;
      }
      // Enviado: a janela fecha e o aviso aparece na página
      view.limpar();
      view.fechar();
      this.avisar(t("report.sent"));
    } catch {
      view.mostrarSituacao(t("coffee.error"), "erro");
      view.travar(false);
    }
  }
}
