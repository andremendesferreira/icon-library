import { idiomaAtual, t } from "../i18n/i18n.js";
import { copiarTexto } from "./clipboard.js";

// Erros da API (scripts/coffee.js) → mensagens
const MENSAGENS = {
  not_paid: "coffee.notPaid",
  unknown_session: "coffee.notPaid",
  other_payment: "coffee.notPaid",
  bad_session: "coffee.notPaid",
  expired: "coffee.expired",
  invalid_code: "coffee.invalidCode",
  code_expired: "coffee.codeExpired",
  too_many_devices: "coffee.tooManyDevices",
  too_many: "coffee.tooMany",
  disabled: "coffee.disabled",
};

// Como o servidor (normalizeCode em scripts/coffee.js): "cafe abcd efgh" → CAFE-ABCD-EFGH
function normalizar(texto) {
  const limpo = texto.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CAFE/, "");
  return limpo.length === 8 ? `CAFE-${limpo.slice(0, 4)}-${limpo.slice(4)}` : null;
}

async function api(rota, corpo) {
  const res = await fetch(rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(dados.error || "server"), { codigoApi: dados.error });
  return dados;
}

// "Pague um café": pagamento no Stripe → código de apoiador → 30 dias sem
// anúncios neste navegador.
export class CoffeeController {
  // aoApoiar(): chamado quando o navegador vira apoiador (desliga os anúncios)
  constructor(model, view, { avisar, aoApoiar }) {
    this.model = model;
    this.view = view;
    this.avisar = avisar;
    this.aoApoiar = aoApoiar;
  }

  data(expira) {
    return new Intl.DateTimeFormat(idiomaAtual(), { dateStyle: "long" }).format(expira);
  }

  // Volta do Stripe (?coffee=…) — antes de os anúncios carregarem, para quem
  // acabou de pagar já não vê-los
  async iniciar() {
    const { view } = this;
    view.aoUsarCodigo((codigo) => this.usarCodigo(codigo));
    // Renovou em outro aparelho: o mesmo código, com a data nova do servidor
    view.aoJaRenovar(() => {
      const guardado = this.model.ler();
      if (guardado) this.usarCodigo(guardado.code);
    });
    view.aoCopiarCodigo((codigo) =>
      copiarTexto(codigo).then(
        () => this.avisar(t("coffee.codeCopied")),
        () => this.avisar(t("toast.copyBlocked")),
      ),
    );

    const url = new URL(location.href);
    const retorno = url.searchParams.get("coffee");
    if (retorno) {
      url.searchParams.delete("coffee");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
      if (retorno === "cancel") this.avisar(t("coffee.cancelled"));
      else await this.confirmarPagamento(retorno);
    }

    const apoiador = this.model.ativo();
    if (apoiador) view.mostrarApoiador(this.data(apoiador.expires));
    // A configuração (link e preço) não atrasa o resto da página
    this.carregarConfiguracao(apoiador);
  }

  async carregarConfiguracao(apoiador) {
    let config = { enabled: false };
    try {
      const res = await fetch("api/coffee/config");
      if (res.ok) config = await res.json();
    } catch {}
    const guardado = this.model.ler();
    this.view.preparar(config, guardado?.code);
    if (guardado && !apoiador && config.enabled)
      this.view.mostrarExpirado({ code: guardado.code, dataTexto: this.data(guardado.expires) });
    if (apoiador) {
      this.view.mostrarApoiador(this.data(apoiador.expires));
      this.view.mostrarObrigado({ code: apoiador.code, dataTexto: this.data(apoiador.expires) });
    }
  }

  async confirmarPagamento(sessao) {
    this.view.abrir();
    this.view.mostrarSituacao(t("coffee.checking"));
    try {
      this.registrar(await api("api/coffee/redeem", { session: sessao }));
    } catch (erro) {
      this.view.mostrarSituacao(this.mensagem(erro), "erro");
    }
  }

  async usarCodigo(codigo) {
    // O mesmo código que este navegador já usa: nada a fazer — perguntar de
    // novo ao servidor gastaria mais um dos aparelhos permitidos
    const atual = this.model.ativo();
    const digitado = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CAFE/, "");
    if (atual && atual.code.replace(/[^A-Z0-9]/g, "").replace(/^CAFE/, "") === digitado) {
      this.view.mostrarObrigado({ code: atual.code, dataTexto: this.data(atual.expires) });
      return;
    }
    this.view.mostrarSituacao(t("coffee.checking"));
    try {
      this.registrar(await api("api/coffee/claim", { code: codigo }));
    } catch (erro) {
      // Código expirado: o botão de pagar passa a renovar esse código
      if (erro.codigoApi === "code_expired") this.view.usarCodigoNoPagamento(normalizar(codigo));
      this.view.mostrarSituacao(this.mensagem(erro), "erro");
    }
  }

  registrar({ code, expires }) {
    this.model.salvar({ code, expires });
    this.view.usarCodigoNoPagamento(code);
    const dataTexto = this.data(new Date(expires));
    this.view.mostrarObrigado({ code, dataTexto });
    this.view.mostrarApoiador(dataTexto);
    this.aoApoiar();
  }

  mensagem(erro) {
    return t(MENSAGENS[erro.codigoApi] ?? "coffee.error", { days: 30 });
  }
}
