const CHAVE = "icon-library:scratchpad";

// Um ícone no texto: o comentário com o nome (opcional) seguido de um <svg>…</svg>
const ENTRADA = /(?:<!--\s*([\s\S]*?)\s*-->\s*)?(<svg\b[\s\S]*?<\/svg>)/gi;

// Os ícones que estão no texto, na ordem: [{ nome, svg, inicio, fim }], com
// inicio e fim do <svg> (o comentário fica de fora: trocar o desenho mantém o
// nome). O texto livre em volta é ignorado.
export function entradasDoTexto(texto) {
  return [...String(texto ?? "").matchAll(ENTRADA)].map((m) => {
    const inicio = m.index + m[0].length - m[2].length;
    return { nome: (m[1] ?? "").trim(), svg: m[2], inicio, fim: inicio + m[2].length };
  });
}

// Troca o SVG de uma entrada pelo novo, no mesmo lugar. A entrada é achada
// pelo SVG que foi aberto (o texto pode ter mudado enquanto o editor estava
// aberto); entre iguais, a mais perto da posição de antes. null se ela sumiu.
export function substituirNoTexto(texto, original, novo, posicao = 0) {
  const candidatas = entradasDoTexto(texto).filter((e) => e.svg === original);
  if (!candidatas.length) return null;
  const alvo = candidatas.reduce((a, b) => (Math.abs(b.inicio - posicao) < Math.abs(a.inicio - posicao) ? b : a));
  return texto.slice(0, alvo.inicio) + novo + texto.slice(alvo.fim);
}

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

  get entradas() {
    return entradasDoTexto(this.texto);
  }

  // Comentário com o nome e, na linha de baixo, o SVG; uma linha em branco
  // separa cada entrada da anterior
  adicionar(nome, svg) {
    const entrada = `<!-- ${nome} -->\n${svg}\n`;
    const atual = this.texto.trimEnd();
    this.definir(atual ? `${atual}\n\n${entrada}` : entrada);
  }

  // Devolve se achou a entrada para trocar
  substituir(original, novo, posicao) {
    const texto = substituirNoTexto(this.texto, original, novo, posicao);
    if (texto === null) return false;
    this.definir(texto);
    return true;
  }

  limpar() {
    this.definir("");
  }
}
