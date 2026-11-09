// Escapa texto vindo de fora (nomes, categorias, versões) antes de ir para
// innerHTML: um nome com "<" ou aspas não vira marcação nem quebra atributo.
const ENTIDADES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (char) => ENTIDADES[char]);
}

// SVG em texto → nó pronto para a página, lido pelo parser XML (innerHTML
// usaria o parser HTML, que lê comentários e <?…?> de outro jeito). null se
// o texto não for um SVG válido.
export function svgDoTexto(texto) {
  const doc = new DOMParser().parseFromString(texto, "image/svg+xml");
  const raiz = doc.documentElement;
  if (doc.querySelector("parsererror") || raiz.localName !== "svg") return null;
  return document.importNode(raiz, true);
}
