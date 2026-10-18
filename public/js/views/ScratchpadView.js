const porId = (id) => document.getElementById(id);

// Gaveta do scratchpad no canto direito: a aba e o botão "Open Scratchpad"
// abrem e fecham; o corpo traz a área de texto e os botões Clear e Copy all.
export class ScratchpadView {
  gaveta = porId("scratchpad");
  corpo = porId("scratchpad-body");
  aba = porId("scratchpad-tab");
  botaoAbrir = porId("scratchpad-open");
  botaoFechar = porId("scratchpad-close");
  area = porId("scratchpad-text");
  botaoLimpar = porId("scratchpad-clear");
  botaoCopiar = porId("scratchpad-copy");

  constructor() {
    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && this.aberto) {
        this.abrir(false);
        this.aba.focus();
      }
    });
  }

  get aberto() {
    return this.gaveta.classList.contains("scratchpad--open");
  }

  get texto() {
    return this.area.value;
  }

  abrir(aberto, { focar = false } = {}) {
    this.gaveta.classList.toggle("scratchpad--open", aberto);
    // Fechada, nada dentro dela recebe foco pelo teclado
    this.corpo.inert = !aberto;
    for (const botao of [this.aba, this.botaoAbrir])
      botao.setAttribute("aria-expanded", String(aberto));
    this.botaoAbrir.textContent = aberto
      ? "Close Scratchpad"
      : "Open Scratchpad";
    if (aberto && focar) this.area.focus();
    // Avisa quem depende da gaveta visível (o anúncio dentro dela)
    this.gaveta.dispatchEvent(
      new CustomEvent("scratchpad:toggle", { bubbles: true, detail: { aberto } }),
    );
  }

  mostrarTexto(texto, { rolarAoFim = false } = {}) {
    this.area.value = texto;
    if (rolarAoFim) this.area.scrollTop = this.area.scrollHeight;
  }

  focar() {
    this.area.focus();
  }

  // ── Ações do usuário ───────────────────────────────────────────────────────
  aoAlternar(acao) {
    this.aba.addEventListener("click", acao);
    this.botaoAbrir.addEventListener("click", acao);
  }

  aoFechar(acao) {
    this.botaoFechar.addEventListener("click", acao);
  }

  aoEditar(acao) {
    this.area.addEventListener("input", () => acao(this.area.value));
  }

  aoLimpar(acao) {
    this.botaoLimpar.addEventListener("click", acao);
  }

  aoCopiar(acao) {
    this.botaoCopiar.addEventListener("click", acao);
  }
}
