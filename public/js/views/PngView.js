import { fecharAoClicarFora } from "./dialogo.js";

const porId = (id) => document.getElementById(id);

export const TAMANHOS_PNG = [16, 24, 32, 48, 64, 128, 256, 512];
export const MIN_PNG = 16;
export const MAX_PNG = 1024;
const CHAVE = "icon-library:png-size";

// Janela "Baixar PNG": escolhe o tamanho antes de baixar (cards e editor).
// abrir() devolve uma promessa com o tamanho escolhido, ou null se fechou.
export class PngView {
  janela = porId("png");
  formulario = porId("png-form");
  opcoes = porId("png-sizes");
  campo = porId("png-custom");

  constructor() {
    this.opcoes.innerHTML = TAMANHOS_PNG.map(
      (n) => `<button type="button" class="png__size" data-size="${n}" aria-pressed="false">${n}</button>`,
    ).join("");
    this.opcoes.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-size]");
      if (botao) this.marcar(Number(botao.dataset.size));
    });
    this.campo.min = MIN_PNG;
    this.campo.max = MAX_PNG;
    this.campo.addEventListener("input", () => this.marcar(Number(this.campo.value), { doCampo: true }));
    porId("png-close").addEventListener("click", () => this.janela.close());
    fecharAoClicarFora(this.janela);
    this.formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const tamanho = this.valido(Number(this.campo.value));
      if (!tamanho) {
        this.campo.reportValidity();
        return;
      }
      try {
        localStorage.setItem(CHAVE, String(tamanho));
      } catch {}
      this.escolhido = tamanho;
      this.janela.close();
    });
    this.janela.addEventListener("close", () => {
      this.resolver?.(this.escolhido ?? null);
      this.resolver = null;
    });
  }

  valido(n) {
    return Number.isInteger(n) && n >= MIN_PNG && n <= MAX_PNG ? n : null;
  }

  marcar(tamanho, { doCampo = false } = {}) {
    if (!doCampo) this.campo.value = tamanho;
    for (const botao of this.opcoes.children)
      botao.setAttribute("aria-pressed", String(Number(botao.dataset.size) === tamanho));
  }

  // sugerido: o tamanho de partida quando não há um escolhido antes
  abrir(sugerido) {
    let salvo = null;
    try {
      salvo = this.valido(Number(localStorage.getItem(CHAVE)));
    } catch {}
    this.escolhido = null;
    this.marcar(salvo ?? this.valido(Math.round(sugerido)) ?? 256);
    return new Promise((resolve) => {
      this.resolver = resolve;
      if (!this.janela.open) this.janela.showModal();
      this.campo.focus();
      this.campo.select();
    });
  }
}
