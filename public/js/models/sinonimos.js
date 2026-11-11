// Busca no idioma de quem visita: os nomes e as palavras-chave dos ícones são
// em inglês, então "lixeira" não acharia nada. Um dicionário por idioma
// (public/json/sinonimos/<idioma>.json: { "lixeira": ["trash", "delete"] })
// diz que termos em inglês procurar também. Funções puras, sem DOM.

// Idiomas com dicionário em public/json/sinonimos/. Os outros nem pedem o
// arquivo (sem 404 no console); um dicionário novo entra aqui também.
export const IDIOMAS_COM_SINONIMOS = ["pt-BR"];

// "Configurações" e "configuracoes" são a mesma busca
export function semAcento(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Dicionário lido do JSON → Map com as chaves já sem acento. Valores que não
// são listas de textos são ignorados.
export function prepararSinonimos(dados) {
  const mapa = new Map();
  for (const [chave, valores] of Object.entries(dados ?? {})) {
    if (!Array.isArray(valores)) continue;
    const termos = valores.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim().toLowerCase());
    if (termos.length) mapa.set(semAcento(chave), [...new Set([...(mapa.get(semAcento(chave)) ?? []), ...termos])]);
  }
  return mapa;
}

const MINIMO_PREFIXO = 3;
const MAXIMO = 12;

// Termos em inglês para procurar além do que foi digitado:
// 1. a busca inteira é uma chave ("lixeira", "seta para cima");
// 2. senão, várias palavras que existem no dicionário viram o nome composto
//    em inglês ("seta direita" → "arrow-right"), como os nomes dos ícones;
// 3. senão, a busca é o começo de chaves ("lixe" → lixeira), para achar
//    enquanto a pessoa ainda digita.
export function expandir(termo, mapa) {
  if (!mapa?.size) return [];
  const busca = semAcento(termo);
  if (!busca) return [];
  if (mapa.has(busca)) return mapa.get(busca).slice(0, MAXIMO);

  const palavras = busca.split(" ").filter((p) => !["de", "da", "do", "das", "dos", "para", "com", "e", "a", "o"].includes(p));
  if (palavras.length > 1 && palavras.every((p) => mapa.has(p))) {
    const primeiros = palavras.map((p) => mapa.get(p)[0]);
    return [primeiros.join("-"), ...palavras.flatMap((p) => mapa.get(p).slice(0, 2))].slice(0, MAXIMO);
  }

  if ([...busca].length < MINIMO_PREFIXO) return [];
  const encontrados = [];
  for (const [chave, termos] of mapa) if (chave.startsWith(busca)) encontrados.push(...termos);
  return [...new Set(encontrados)].slice(0, MAXIMO);
}
