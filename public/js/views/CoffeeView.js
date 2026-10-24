import { t } from "../i18n/i18n.js";
import { fecharAoClicarFora } from "./dialogo.js";

const porId = (id) => document.getElementById(id);

// Janela "pague um café": explica, leva ao pagamento no Stripe, recebe o
// código de apoiador e mostra o agradecimento com o código.
export class CoffeeView {
  janela = porId("coffee");
  botoes = [...document.querySelectorAll("[data-coffee-open]")];
  textoBotao = porId("coffee-open-text");
  pagar = porId("coffee-pay");
  convite = porId("coffee-invite");
  obrigado = porId("coffee-thanks");
  obrigadoTexto = porId("coffee-thanks-text");
  ajudaCodigo = porId("coffee-code-help");
  codigoMostrado = porId("coffee-code-value");
  formulario = porId("coffee-form");
  campoCodigo = porId("coffee-code");
  situacao = porId("coffee-status");
  explicacao = porId("coffee-text");

  constructor() {
    for (const botao of this.botoes) botao.addEventListener("click", () => this.abrir());
    porId("coffee-close").addEventListener("click", () => this.janela.close());
    fecharAoClicarFora(this.janela);
  }

  // config: { enabled, link, price, days, devices }
  preparar(config) {
    for (const botao of this.botoes) botao.hidden = !config.enabled;
    if (!config.enabled) return;
    this.pagar.href = config.link;
    this.pagar.textContent = t("coffee.pay", { price: config.price });
    this.explicacao.textContent = t("coffee.text", { days: config.days });
    this.devices = config.devices;
  }

  // Apoiador ativo: o botão vira um agradecimento (e reabre o código)
  mostrarApoiador(dataTexto) {
    for (const botao of this.botoes) {
      botao.hidden = false;
      botao.classList.add("coffee-button--supporter");
      botao.title = t("coffee.supporterTitle", { date: dataTexto });
    }
    if (this.textoBotao) this.textoBotao.textContent = t("coffee.supporter");
  }

  abrir() {
    if (!this.janela.open) this.janela.showModal();
  }

  mostrarSituacao(mensagem, tipo = "info") {
    this.situacao.textContent = mensagem;
    this.situacao.dataset.tipo = tipo;
  }

  // Depois de pagar (ou de usar um código): agradecimento com o código
  mostrarObrigado({ code, dataTexto, devices = this.devices ?? 3 }) {
    this.convite.hidden = true;
    this.obrigado.hidden = false;
    this.obrigadoTexto.textContent = t("coffee.thanksText", { date: dataTexto });
    this.ajudaCodigo.textContent = t("coffee.codeHelp", { devices });
    this.codigoMostrado.textContent = code;
    // Já é apoiador neste navegador: o campo do código some (antes, cada
    // novo clique em "Aplicar" gastava mais um aparelho)
    this.formulario.hidden = true;
    this.campoCodigo.value = "";
    this.mostrarSituacao("");
  }

  aoUsarCodigo(acao) {
    this.formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const codigo = this.campoCodigo.value.trim();
      if (codigo) acao(codigo);
    });
  }

  aoCopiarCodigo(acao) {
    porId("coffee-copy").addEventListener("click", () => acao(this.codigoMostrado.textContent));
  }
}
