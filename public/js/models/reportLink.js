// Relato de bug: o contexto que vai junto e o link para abrir um issue no
// GitHub já preenchido. Funções puras (testadas em tests/).

export const REPOSITORIO = "https://github.com/andremendesferreira/icon-library";
// O texto vai no endereço: corta antes de o link ficar longo demais
const MAXIMO_NO_LINK = 1500;

// contexto: { page, lang, browser, screen } (o que o formulário envia)
export function linkDoGithub(mensagem, contexto) {
  const texto = String(mensagem || "").trim();
  const primeira = texto.split("\n")[0].trim();
  const titulo = primeira ? (primeira.length > 70 ? `${primeira.slice(0, 67)}…` : primeira) : "Bug report";
  const corpo = [
    "**What happened**",
    "",
    texto.length > MAXIMO_NO_LINK ? `${texto.slice(0, MAXIMO_NO_LINK)}…` : texto || "_Describe what you did, what you expected and what happened instead._",
    "",
    "---",
    `- Page: ${contexto.page}`,
    `- Language: ${contexto.lang}`,
    `- Browser: ${contexto.browser}`,
    `- Window: ${contexto.screen}`,
  ].join("\n");
  const parametros = new URLSearchParams({ title: titulo, body: corpo, labels: "bug" });
  return `${REPOSITORIO}/issues/new?${parametros}`;
}

// endereco: location.href; o fragmento pode ter um ícone inteiro (#svg=…),
// que não interessa ao relato e deixaria o texto enorme
export function paginaDoRelato(endereco) {
  const url = new URL(endereco);
  url.hash = "";
  url.searchParams.delete("coffee");
  return url.toString();
}
