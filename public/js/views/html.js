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
