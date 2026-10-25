import { fecharAoClicarFora } from "./dialogo.js";

const porId = (id) => document.getElementById(id);

// Janela "Reportar bug": o que aconteceu, e-mail opcional e o link para o
// GitHub, para quem prefere abrir um issue.
export class ReportView {
  janela = porId("report");
  botoes = [...document.querySelectorAll("[data-report-open]")];
  formulario = porId("report-form");
  mensagem = porId("report-message");
  email = porId("report-email");
  armadilha = porId("report-website");
  enviar = porId("report-send");
  github = porId("report-github");
  situacao = porId("report-status");

  constructor() {
    porId("report-close").addEventListener("click", () => this.fechar());
    fecharAoClicarFora(this.janela);
    // Um erro some quando a pessoa volta a escrever
    this.formulario.addEventListener("input", () => {
      if (this.situacao.dataset.tipo === "erro") this.mostrarSituacao("");
    });
  }

  aoAbrir(acao) {
    for (const botao of this.botoes) botao.addEventListener("click", acao);
  }

  aoEnviar(acao) {
    this.formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      acao({ message: this.mensagem.value, email: this.email.value, website: this.armadilha.value });
    });
  }

  // O link é montado na hora do clique, com o que já foi escrito
  aoAbrirGithub(montarLink) {
    this.github.addEventListener("click", () => {
      this.github.href = montarLink(this.mensagem.value);
    });
  }

  // disponivel: o servidor aceita relatos (senão só o GitHub)
  preparar({ disponivel }) {
    this.formulario.hidden = !disponivel;
  }

  abrir() {
    this.mostrarSituacao("");
    this.travar(false);
    if (!this.janela.open) this.janela.showModal();
    if (!this.formulario.hidden) this.mensagem.focus();
  }

  fechar() {
    this.janela.close();
  }

  limpar() {
    this.mensagem.value = "";
    this.email.value = "";
  }

  travar(enviando) {
    this.enviar.disabled = enviando;
  }

  mostrarSituacao(mensagem, tipo = "info") {
    this.situacao.textContent = mensagem;
    this.situacao.dataset.tipo = tipo;
  }
}
