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
  renovar = porId("coffee-renew");
  jaRenovei = porId("coffee-renewed-row");
  renovarAntes = porId("coffee-renew-early");

  constructor() {
    for (const botao of this.botoes) botao.addEventListener("click", () => this.abrir());
    porId("coffee-close").addEventListener("click", () => this.janela.close());
    fecharAoClicarFora(this.janela);
  }

  // config: { enabled, link, price, days, devices }; codigo: o código que este
  // navegador conhece (vigente ou expirado), para o pagamento renová-lo
  preparar(config, codigo = null) {
    for (const botao of this.botoes) botao.hidden = !config.enabled;
    if (!config.enabled) return;
    this.config = config;
    this.pagar.textContent = t("coffee.pay", { price: config.price });
    this.explicacao.textContent = t("coffee.text", { days: config.days });
    this.devices = config.devices;
    this.renovarAntes.textContent = t("coffee.renewEarly", { days: config.days });
    this.usarCodigoNoPagamento(codigo);
  }

  // O Stripe devolve o client_reference_id na sessão: o servidor estende
  // esse código em vez de criar outro
  usarCodigoNoPagamento(codigo) {
    if (!this.config) return;
    const link = new URL(this.config.link);
    if (codigo) link.searchParams.set("client_reference_id", codigo);
    this.pagar.href = link.href;
    this.renovarAntes.href = link.href;
    this.renovarAntes.hidden = !codigo;
  }

  // O período deste navegador terminou: oferece renovar o mesmo código
  mostrarExpirado({ code, dataTexto }) {
    this.renovar.textContent = t("coffee.expiredText", { date: dataTexto, code, days: this.config?.days ?? 30 });
    this.renovar.hidden = false;
    this.jaRenovei.hidden = false;
    if (this.config) this.pagar.textContent = t("coffee.renewPay", { price: this.config.price });
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

  aoJaRenovar(acao) {
    porId("coffee-renewed").addEventListener("click", () => acao());
  }

  aoCopiarCodigo(acao) {
    porId("coffee-copy").addEventListener("click", () => acao(this.codigoMostrado.textContent));
  }
}
