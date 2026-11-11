import { t } from "../i18n/i18n.js";
import { escapar, svgDoTexto } from "./html.js";

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
  icones = porId("scratchpad-icons");
  enviar = this.icones.querySelector(".scratchpad__enviar");
  arquivo = porId("scratchpad-file");

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
      ? t("scratchpad.close")
      : t("scratchpad.open");
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

  // Grade dos ícones do texto: [{ nome, svg }] (svg já limpo). O bloco de
  // enviar arquivos fica sempre por primeiro.
  mostrarIcones(icones) {
    const botoes = icones.map(({ nome, svg }, i) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "scratchpad__icone";
      botao.setAttribute("role", "listitem");
      botao.dataset.i = String(i);
      botao.title = nome || t("scratchpad.unnamed");
      botao.setAttribute("aria-label", t("scratchpad.editIcon", { name: nome || t("scratchpad.unnamed") }));
      const desenho = svgDoTexto(svg);
      if (desenho) botao.append(desenho);
      botao.insertAdjacentHTML("beforeend", `<span>${escapar(nome || t("scratchpad.unnamed"))}</span>`);
      return botao;
    });
    this.icones.replaceChildren(this.enviar, ...botoes);
  }

  aoAbrirIcone(acao) {
    this.icones.addEventListener("click", (evento) => {
      const botao = evento.target.closest(".scratchpad__icone");
      if (botao) acao(Number(botao.dataset.i));
    });
  }

  // Arquivos escolhidos no seletor ou soltos sobre a grade
  aoEnviarArquivos(acao) {
    this.arquivo.addEventListener("change", () => {
      if (this.arquivo.files.length) acao([...this.arquivo.files]);
      this.arquivo.value = "";
    });
    this.icones.addEventListener("dragover", (evento) => {
      if (![...evento.dataTransfer.types].includes("Files")) return;
      evento.preventDefault();
      this.icones.classList.add("scratchpad__icones--alvo");
    });
    this.icones.addEventListener("dragleave", (evento) => {
      if (!this.icones.contains(evento.relatedTarget)) this.icones.classList.remove("scratchpad__icones--alvo");
    });
    this.icones.addEventListener("drop", (evento) => {
      this.icones.classList.remove("scratchpad__icones--alvo");
      if (!evento.dataTransfer.files.length) return;
      evento.preventDefault();
      acao([...evento.dataTransfer.files]);
    });
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
