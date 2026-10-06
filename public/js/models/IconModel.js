import { FONTES } from "./iconSets.js";
import { criarDetector } from "./glyphDetector.js";

const OUTROS = "others";

// Ordem alfabética, com "others" sempre por último
function ordenarGrupos(mapa) {
  return [...mapa.entries()].sort(
    ([a], [b]) => (a === OUTROS) - (b === OUTROS) || a.localeCompare(b, "en"),
  );
}

async function baixar(url, respostaPadrao) {
  const { endereco, opcional, resposta } =
    typeof url === "string" ? { endereco: url } : url;
  const comoTexto = (resposta ?? respostaPadrao) === "texto";
  try {
    const res = await fetch(endereco);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return comoTexto ? await res.text() : await res.json();
  } catch (erro) {
    if (!opcional) throw erro;
    console.warn(
      `[icons] optional source unavailable: ${endereco} — ${erro.message}`,
    );
    return undefined;
  }
}

// Dados e estado da página: conjuntos, itens carregados e filtros escolhidos.
// Não conhece o DOM.
export class IconModel {
  fontes = FONTES;
  cache = new Map();
  // Conjunto escolhido por último. Um carregamento que termina depois de o
  // usuário já ter trocado de conjunto só alimenta o cache, sem ir para a tela.
  fonteAtual = null;
  // Conjunto cujos itens estão na tela
  fonteExibida = null;
  itens = [];
  usouAlternativa = false;
  gruposEscolhidos = new Set();

  emCache(chave) {
    return this.cache.has(chave);
  }

  async carregar(chave) {
    if (this.cache.has(chave)) return this.cache.get(chave);

    const fonte = this.fontes[chave];
    const varias = Array.isArray(fonte.url);
    const urls = varias ? fonte.url : [fonte.url];
    const respostas = await Promise.all(
      urls.map((url) => baixar(url, fonte.resposta)),
    );
    const itens = fonte.montar(varias ? respostas : respostas[0]);

    if (fonte.detectaGlifo) {
      const temGlifo = criarDetector();
      for (const item of itens) item.suportado = temGlifo(item.char);
    } else for (const item of itens) item.suportado = true;

    const dados = {
      itens,
      // Alguma fonte opcional (as categorias) falhou
      usouAlternativa: varias && respostas.some((r) => r === undefined),
    };
    this.cache.set(chave, dados);
    return dados;
  }

  exibir(chave, { itens, usouAlternativa }) {
    this.fonteExibida = this.fontes[chave];
    this.itens = itens;
    this.usouAlternativa = usouAlternativa;
    this.gruposEscolhidos.clear();
  }

  get detectaGlifo() {
    return Boolean(this.fonteExibida?.detectaGlifo);
  }

  get rotuloTodos() {
    const fonte = this.fonteExibida;
    return this.usouAlternativa && fonte.rotuloGrupoAlternativo
      ? fonte.rotuloGrupoAlternativo
      : fonte.rotuloGrupo;
  }

  alternarGrupo(grupo, marcado) {
    if (marcado) this.gruposEscolhidos.add(grupo);
    else this.gruposEscolhidos.delete(grupo);
  }

  limparGrupos() {
    this.gruposEscolhidos.clear();
  }

  // [grupo, quantidade] de todos os itens do conjunto
  contarGrupos() {
    const contagem = new Map();
    for (const item of this.itens)
      contagem.set(item.grupo, (contagem.get(item.grupo) || 0) + 1);
    return ordenarGrupos(contagem);
  }

  // [grupo, itens] dos itens que passam pelos filtros
  filtrar({ busca, apenasSuportados }) {
    const termo = busca.toLowerCase();
    const grupos = new Map();
    for (const item of this.itens) {
      if (termo && !item.nome.toLowerCase().includes(termo)) continue;
      if (this.gruposEscolhidos.size && !this.gruposEscolhidos.has(item.grupo))
        continue;
      if (this.detectaGlifo && apenasSuportados && !item.suportado) continue;
      if (!grupos.has(item.grupo)) grupos.set(item.grupo, []);
      grupos.get(item.grupo).push(item);
    }
    return ordenarGrupos(grupos);
  }

  resumo() {
    const semDesenho = this.itens.filter((item) => !item.suportado);
    return {
      total: this.itens.length,
      emoji: this.detectaGlifo,
      semDesenho: semDesenho.length,
      versoes: [...new Set(semDesenho.map((item) => item.versao))].sort(),
    };
  }
}
