// Tradução da página principal. O idioma é escolhido por detect.js; aqui se
// carrega o dicionário dele (só o necessário, além do inglês, que cobre
// qualquer texto que falte) e se traduz o HTML marcado com data-i18n.
//
//   <span data-i18n="chave">           → textContent
//   <p data-i18n-html="chaveHtml">     → innerHTML (só textos do dicionário)
//   <input data-i18n-attr="placeholder:chave;title:outra">
//   <a data-i18n-page="about">         → href da página no idioma (about.pt-BR.html)
import en from "./en.js";

const deteccao = globalThis.IconLibraryLang;

let idioma = "en";
let dicionario = en;
let plurais = new Intl.PluralRules("en");

export function idiomaAtual() {
  return idioma;
}

export async function carregarIdioma(pedido = deteccao?.atual ?? "en") {
  if (pedido !== "en") {
    try {
      dicionario = (await import(`./${pedido}.js`)).default;
      idioma = pedido;
    } catch (erro) {
      console.warn(`[i18n] ${pedido} unavailable, using English`, erro);
    }
  }
  plurais = new Intl.PluralRules(idioma);
  return idioma;
}

// t("toast.downloading", { file: "x.svg" }); plural: t("chave", { n: 3 })
export function t(chave, valores = {}) {
  let texto = dicionario[chave] ?? en[chave] ?? chave;
  if (typeof texto === "object")
    texto = texto[plurais.select(valores.n ?? 0)] ?? texto.other;
  return texto.replace(/\{(\w+)\}/g, (marca, nome) =>
    nome in valores ? String(valores[nome]) : marca,
  );
}

// Erros dos models trazem um código (veja models/erros.js); os demais
// mostram a própria mensagem
export function tErro(erro) {
  if (!erro?.codigo) return erro?.message ?? String(erro);
  const valores = {};
  for (const [nome, valor] of Object.entries(erro.dados ?? {}))
    valores[nome] = valor?.codigo ? tErro(valor) : valor;
  return t(erro.codigo, valores);
}

// "A, B e C" no idioma da página
export function lista(itens) {
  return new Intl.ListFormat(idioma, { type: "conjunction" }).format(itens);
}

export function numero(n) {
  return new Intl.NumberFormat(idioma).format(n);
}

export function traduzirPagina(raiz = document) {
  for (const el of raiz.querySelectorAll("[data-i18n]"))
    el.textContent = t(el.dataset.i18n);
  for (const el of raiz.querySelectorAll("[data-i18n-html]"))
    el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of raiz.querySelectorAll("[data-i18n-attr]"))
    for (const par of el.dataset.i18nAttr.split(";")) {
      const [atributo, chave] = par.split(":").map((s) => s.trim());
      if (atributo && chave) el.setAttribute(atributo, t(chave));
    }
  if (deteccao)
    for (const el of raiz.querySelectorAll("[data-i18n-page]"))
      el.setAttribute("href", deteccao.pagina(el.dataset.i18nPage, idioma));

  if (raiz !== document) return;
  const html = document.documentElement;
  html.lang = idioma;
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  // Com ?lang=xx, essa é a versão "oficial" do endereço para os buscadores
  const canonico = document.querySelector('link[rel="canonical"]');
  if (canonico && idioma !== "en" && new URLSearchParams(location.search).has("lang"))
    canonico.href = `${canonico.href.split("?")[0]}?lang=${idioma}`;
  // Scripts comuns (tema, voltar ao topo) leem os rótulos daqui
  html.dataset.labelToDark = t("theme.toDark");
  html.dataset.labelToLight = t("theme.toLight");
  html.dataset.labelTop = t("goTop.label");
  const topo = document.querySelector(".back-to-top");
  if (topo) {
    topo.title = t("goTop.label");
    topo.setAttribute("aria-label", t("goTop.label"));
  }
  html.classList.remove("i18n-pendente");
  document.dispatchEvent(new CustomEvent("i18n:pronto", { detail: { idioma } }));
}
