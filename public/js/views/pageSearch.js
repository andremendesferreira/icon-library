// Páginas de texto (Guia, Sobre, guias dos conjuntos…): "/" leva à busca do
// topo, que abre a página dos ícones já com a palavra (./?q=…). Menos ao
// digitar num campo.
document.addEventListener("keydown", (evento) => {
  if (evento.key !== "/" || evento.ctrlKey || evento.metaKey || evento.altKey) return;
  if (evento.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const campo = document.getElementById("page-search");
  if (!campo) return;
  evento.preventDefault();
  campo.focus();
});
