import { FONTES } from "./iconSets.js";
import { criarDetector } from "./glyphDetector.js";
import { ESTILO_PADRAO, aplicarEstilo } from "./svgTools.js";
import { IDIOMAS_COM_SINONIMOS, expandir, prepararSinonimos } from "./sinonimos.js";

const CHAVE_ESTILO = "icon-library:style";

function lerEstilo() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_ESTILO));
    return { ...ESTILO_PADRAO, ...salvo };
  } catch {
    return { ...ESTILO_PADRAO };
  }
}

const OUTROS = "others";

// SVG de um item. O emoji vira um <text> dentro do SVG — ainda depende da
// fonte do sistema para aparecer.
export function svgDoItem(item) {
  return item.tipo === "svg"
    ? item.svg
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="24" height="24"><text y=".9em" font-size="90">${item.char}</text></svg>`;
}

const STUDIO = "https://studio.lucide.dev/edit";

// Link que abre o ícone no Lucide Studio, o editor de SVG do Lucide. O Studio
// recebe pela URL só o conteúdo interno do <svg> (24×24, traço), por isso
// serve apenas aos conjuntos marcados como editáveis (Lucide e Feather).
export function linkDoStudio(item) {
  if (!item.editavel) return null;
  const interno = item.svg
    .replace(/^<svg[^>]*>|<\/svg>$/g, "")
    .replace(/>\s+</g, "><")
    .trim();
  const nome = item.nome.replace(/ /g, "-");
  return `${STUDIO}?value=${encodeURIComponent(interno)}&name=${encodeURIComponent(nome)}`;
}

// Quão bem um item acha a busca (menor é melhor): o nome igual, o nome que
// começa com o termo, o nome que o contém, uma tag igual, uma tag que o
// contém; null se não acha
function acertoDaBusca(item, termo) {
  const nome = item.nome.toLowerCase();
  if (nome === termo) return 0;
  if (nome.startsWith(termo)) return 1;
  if (nome.includes(termo)) return 2;
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());
  if (tags.includes(termo)) return 3;
  return tags.some((tag) => tag.includes(termo)) ? 4 : null;
}

// Termo vindo do dicionário: só palavra inteira ("cart" acha shopping-cart,
// não carton) ou palavra-chave exata. Nome composto ("arrow-right") com todas
// as partes vem antes de uma palavra solta.
function acertoDoSinonimo(item, termo) {
  // Os nomes chegam com espaço ("arrow right") ou hífen ("arrow-right")
  const nome = item.nome.toLowerCase().replace(/\s+/g, "-");
  if (nome === termo.replace(/\s+/g, "-")) return 0;
  const partes = nome.split(/[-\s]+/);
  const pedidas = termo.split(/[-\s]+/);
  if (pedidas.every((p) => partes.includes(p))) return pedidas.length > 1 ? 1 : 2;
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());
  return tags.includes(termo) ? 3 : null;
}

// Acerto pelo termo digitado ou, se nada bater, por um dos termos em inglês
// do dicionário do idioma (models/sinonimos.js)
// Ordem: acerto direto forte (nome, palavra-chave exata: 0–3), sinônimo
// (4–7), e só então um pedaço de palavra-chave (8), que é o mais fraco —
// "sino" é um pedaço de "casino", mas quem busca "sino" quer o sino
function acertoComSinonimos(item, termo, extras) {
  const direto = acertoDaBusca(item, termo);
  if (!extras.length) return direto;
  if (direto !== null && direto <= 3) return direto;
  let melhor = null;
  for (const extra of extras) {
    const acerto = acertoDoSinonimo(item, extra);
    if (acerto !== null && (melhor === null || acerto < melhor)) melhor = acerto;
    if (melhor === 0) break;
  }
  if (melhor !== null) return 4 + melhor;
  return direto === null ? null : 8;
}

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
  // Sinônimos do idioma da página (Map), ou null em inglês ou sem o arquivo
  sinonimos = null;
  // Tamanho, traço e cor aplicados ao que é copiado/baixado; lembrados
  // entre visitas
  estilo = lerEstilo();

  definirEstilo(mudancas) {
    this.estilo = { ...this.estilo, ...mudancas };
    try {
      localStorage.setItem(CHAVE_ESTILO, JSON.stringify(this.estilo));
    } catch {}
  }

  restaurarEstilo() {
    this.definirEstilo(ESTILO_PADRAO);
  }

  // SVG do item com o estilo escolhido: o que vai para a cópia, o download
  // e o scratchpad
  svgFinal(item) {
    return aplicarEstilo(svgDoItem(item), this.estilo);
  }

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
      // Alguma fonte opcional que muda a tela (as categorias) falhou; as
      // "extra" (tags da busca) não contam
      usouAlternativa: varias && respostas.some((r, i) => r === undefined && !urls[i]?.extra),
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

  // O que o conjunto exibido permite personalizar
  get personalizavel() {
    const fonte = this.fonteExibida;
    return { traco: Boolean(fonte?.temTraco), cor: Boolean(fonte?.temCor) };
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

  // Conjuntos com contorno e preenchido (Bootstrap): "todos", "contorno" ou
  // "preenchido". Os outros conjuntos ignoram.
  get temVariantes() {
    return Boolean(this.fonteExibida?.temVariantes);
  }

  // [grupo, itens] dos itens que passam pelos filtros. A busca vale para o
  // nome e as palavras-chave (tags). Com busca, os melhores acertos vêm
  // primeiro (veja acertoDaBusca), dentro de cada categoria e na ordem das
  // categorias.
  filtrar({ busca, apenasSuportados, variante = "todos" }) {
    const porVariante = this.temVariantes && variante !== "todos";
    const termo = busca.trim().toLowerCase();
    const extras = termo ? expandir(termo, this.sinonimos) : [];
    const grupos = new Map();
    const nota = new Map();
    for (const item of this.itens) {
      const acerto = termo ? acertoComSinonimos(item, termo, extras) : 0;
      if (acerto === null) continue;
      if (this.gruposEscolhidos.size && !this.gruposEscolhidos.has(item.grupo))
        continue;
      if (this.detectaGlifo && apenasSuportados && !item.suportado) continue;
      if (porVariante && item.variante !== variante) continue;
      if (!grupos.has(item.grupo)) grupos.set(item.grupo, []);
      grupos.get(item.grupo).push(item);
      nota.set(item, acerto);
    }
    const ordem = ordenarGrupos(grupos);
    if (!termo) return ordem;
    for (const [, itens] of ordem) itens.sort((a, b) => nota.get(a) - nota.get(b));
    const melhor = ([, itens]) => nota.get(itens[0]);
    // sort é estável: empatadas, as categorias seguem em ordem alfabética
    return ordem.sort((a, b) => melhor(a) - melhor(b));
  }

  // Quantos itens de um conjunto já carregado acham esta busca (nome ou tag);
  // null se o conjunto ainda não foi baixado
  contarEm(chave, busca) {
    const termo = busca.trim().toLowerCase();
    const dados = this.cache.get(chave);
    if (!dados || dados instanceof Promise || !termo) return null;
    const extras = expandir(termo, this.sinonimos);
    return dados.itens.filter((item) => acertoComSinonimos(item, termo, extras) !== null).length;
  }

  // Dicionário de sinônimos do idioma (public/json/sinonimos/<idioma>.json).
  // Em inglês não há; se o arquivo faltar, a busca segue só em inglês.
  async carregarSinonimos(idioma) {
    if (!IDIOMAS_COM_SINONIMOS.includes(idioma)) return false;
    const dados = await baixar({ endereco: `json/sinonimos/${idioma}.json`, opcional: true });
    this.sinonimos = dados ? prepararSinonimos(dados) : null;
    return Boolean(this.sinonimos?.size);
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
