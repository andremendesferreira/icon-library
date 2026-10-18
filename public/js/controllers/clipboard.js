// Só funciona em contexto seguro (https:// ou localhost)
export function copiarTexto(texto) {
  return navigator.clipboard.writeText(texto);
}
