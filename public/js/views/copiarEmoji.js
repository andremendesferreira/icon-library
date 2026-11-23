// Página "Emojis para copiar e colar": um clique num emoji copia o caractere
// e o aviso (role="status") diz o que foi copiado. Sem a área de
// transferência (página sem HTTPS, permissão negada), explica como copiar à mão.
{
  const aviso = document.querySelector(".emoji-copiar__aviso");
  let relogio = 0;
  document.addEventListener("click", async (evento) => {
    const botao = evento.target.closest("button[data-emoji]");
    if (!botao || !aviso) return;
    const emoji = botao.dataset.emoji;
    try {
      await navigator.clipboard.writeText(emoji);
      aviso.textContent = `${aviso.dataset.copiado} ${emoji}`;
      botao.classList.add("emoji-copiar--feito");
      clearTimeout(relogio);
      relogio = setTimeout(() => botao.classList.remove("emoji-copiar--feito"), 900);
    } catch {
      aviso.textContent = aviso.dataset.erro;
    }
  });
}
