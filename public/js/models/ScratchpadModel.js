const CHAVE = "icon-library:scratchpad";

// Texto do scratchpad. Fica guardado no navegador, para sobreviver a um reload.
export class ScratchpadModel {
  constructor() {
    try {
      this.texto = localStorage.getItem(CHAVE) || "";
    } catch {
      this.texto = ""; // armazenamento bloqueado (janela anônima, etc.)
    }
  }

  definir(texto) {
    this.texto = texto;
    try {
      localStorage.setItem(CHAVE, texto);
    } catch {}
  }

  // Comentário com o nome e, na linha de baixo, o SVG; uma linha em branco
  // separa cada entrada da anterior
  adicionar(nome, svg) {
    const entrada = `<!-- ${nome} -->\n${svg}\n`;
    const atual = this.texto.trimEnd();
    this.definir(atual ? `${atual}\n\n${entrada}` : entrada);
  }

  limpar() {
    this.definir("");
  }
}
