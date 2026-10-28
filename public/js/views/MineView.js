import { t } from "../i18n/i18n.js";
import { escapar } from "./html.js";
import { fecharAoClicarFora } from "./dialogo.js";

const porId = (id) => document.getElementById(id);

// Janela "Meus ícones": os ícones que o apoiador publicou na Iconlibrary,
// com a situação de cada um e o botão Editar.
export class MineView {
  janela = porId("mine");
  botoes = [...document.querySelectorAll("[data-mine-open]")];
  formulario = porId("mine-form");
  campoCodigo = porId("mine-code");
  lista = porId("mine-list");
  situacao = porId("mine-status");

  constructor() {
    porId("mine-close").addEventListener("click", () => this.janela.close());
    fecharAoClicarFora(this.janela);
  }

  aoAbrir(acao) {
    for (const botao of this.botoes) botao.addEventListener("click", acao);
  }

  aoBuscar(acao) {
    this.formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const codigo = this.campoCodigo.value.trim();
      if (codigo) acao(codigo);
    });
  }

  aoEditar(acao) {
    this.lista.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-id]");
      if (botao) acao(Number(botao.dataset.id));
    });
  }

  // codigo: o do apoiador neste navegador, se houver
  abrir(codigo) {
    // As janelas de publicar e do café saem: esta toma o lugar delas
    for (const id of ["publish", "coffee"]) if (porId(id)?.open) porId(id).close();
    this.campoCodigo.value = codigo || "";
    this.lista.replaceChildren();
    this.mostrarSituacao("");
    if (!this.janela.open) this.janela.showModal();
    if (!codigo) this.campoCodigo.focus();
  }

  fechar() {
    this.janela.close();
  }

  mostrarSituacao(mensagem, tipo = "info") {
    this.situacao.textContent = mensagem;
    this.situacao.dataset.tipo = tipo;
  }

  // icones: [{ id, name, svg, status, revision }] — o SVG já foi validado e
  // limpo pelo servidor (scripts/svgSafe.js) quando foi enviado
  mostrarIcones(icones) {
    if (!icones.length) {
      this.lista.replaceChildren();
      this.mostrarSituacao(t("mine.empty"));
      return;
    }
    this.mostrarSituacao("");
    this.lista.innerHTML = icones
      .map((icone) => {
        const atual = icone.revision ?? icone;
        const situacao = icone.revision ? "revision" : icone.status;
        return `<li class="mine__item">
          <span class="mine__preview" aria-hidden="true">${atual.svg}</span>
          <span class="mine__info">
            <strong>${escapar(atual.name)}</strong>
            <span class="mine__status mine__status--${situacao}">${escapar(t(`mine.status.${situacao}`))}</span>
          </span>
          <button type="button" data-id="${icone.id}">${escapar(t("mine.edit"))}</button>
        </li>`;
      })
      .join("");
  }
}
