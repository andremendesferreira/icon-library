// Conjuntos de ícones disponíveis: de onde vêm os dados e como viram itens.
// Para adicionar um conjunto, basta declarar uma nova entrada em FONTES.

// Versões fixas dos pacotes: uma versão nova só entra quando for trocada aqui
// (e testada), em vez de chegar sozinha e quebrar a página. Mantenha iguais às
// de scripts/generate-icon-categories.js.
export const VERSOES = {
  emoji: "0.9.0", // unicode-emoji-json
  lucide: "1.59.0", // lucide-static
  feather: "4.29.2", // feather-icons
  bootstrap: "1.13.2", // bootstrap-icons
};

const porLetra = (nome) => {
  const letra = nome.trim()[0]?.toUpperCase() || "#";
  return /[A-Z]/.test(letra) ? letra : "#";
};

function envelopeTraco(conteudo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${conteudo}</svg>`;
}

function envelopePreenchido(conteudo, viewBox) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${viewBox}" fill="currentColor">${conteudo}</svg>`;
}

export const FONTES = {
  emoji: {
    rotulo: "Emoji (Unicode)",
    rotuloGrupo: "categories.all",
    url: `https://unpkg.com/unicode-emoji-json@${VERSOES.emoji}/data-by-emoji.json`,
    detectaGlifo: true,
    montar: (dados) =>
      Object.entries(dados).map(([char, info]) => ({
        nome: info.slug.replace(/_/g, " "),
        tipo: "emoji",
        char,
        grupo: info.group || "Sem grupo",
        versao: info.emoji_version || info.unicode_version || "",
      })),
  },
  lucide: {
    rotulo: "Lucide",
    // Ícones de traço que herdam a cor do texto: espessura e cor ajustáveis
    temTraco: true,
    temCor: true,
    rotuloGrupo: "categories.all",
    rotuloGrupoAlternativo: "letters.all",
    url: [
      `https://unpkg.com/lucide-static@${VERSOES.lucide}/icon-nodes.json`,
      { endereco: "https://lucide.dev/api/categories", opcional: true },
    ],
    montar: ([icones, categorias]) =>
      Object.entries(icones).map(([nome, nos]) => ({
        nome: nome.replace(/-/g, " "),
        tipo: "svg",
        editavel: true,
        grupo: categorias
          ? categorias[nome]?.[0] || "without category"
          : porLetra(nome),
        svg: envelopeTraco(
          nos
            .map(
              ([tag, atributos]) =>
                `<${tag} ${Object.entries(atributos)
                  .map(([chave, valor]) => `${chave}="${valor}"`)
                  .join(" ")}/>`,
            )
            .join(""),
        ),
      })),
  },
  feather: {
    rotulo: "Feather",
    temTraco: true,
    temCor: true,
    rotuloGrupo: "categories.all",
    rotuloGrupoAlternativo: "letters.all",
    url: [
      `https://unpkg.com/feather-icons@${VERSOES.feather}/dist/icons.json`,
      { endereco: "json/icons-categories.json", opcional: true },
    ],
    montar: ([icones, categorias]) =>
      Object.entries(icones).map(([nome, conteudo]) => ({
        nome: nome.replace(/-/g, " "),
        tipo: "svg",
        editavel: true,
        grupo:
          categorias?.feather?.[nome]?.[0] ||
          (categorias ? "others" : porLetra(nome)),
        svg: envelopeTraco(conteudo),
      })),
  },
  bootstrap: {
    rotulo: "Bootstrap",
    // Preenchidos: só a cor é ajustável
    temCor: true,
    rotuloGrupo: "categories.all",
    rotuloGrupoAlternativo: "letters.all",
    url: [
      {
        endereco: `https://unpkg.com/bootstrap-icons@${VERSOES.bootstrap}/bootstrap-icons.svg`,
        resposta: "texto",
      },
      { endereco: "json/icons-categories.json", opcional: true },
    ],
    montar: ([sprite, categorias]) =>
      [
        ...new DOMParser()
          .parseFromString(sprite, "image/svg+xml")
          .querySelectorAll("symbol"),
      ].map((simbolo) => ({
        nome: simbolo.id.replace(/-/g, " "),
        tipo: "svg",
        grupo:
          categorias?.bootstrap?.[simbolo.id]?.[0] ||
          (categorias ? "others" : porLetra(simbolo.id)),
        svg: envelopePreenchido(
          simbolo.innerHTML.replace(
            /\s*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,
            "",
          ),
          simbolo.getAttribute("viewBox") || "0 0 24 24",
        ),
      })),
  },
  // Fonte da comunidade: ícones enviados por apoiadores e aprovados (MIT).
  // Sem banco no servidor, a lista vem vazia.
  iconlibrary: {
    rotulo: "Iconlibrary",
    temCor: true,
    rotuloGrupo: "categories.all",
    url: "api/iconlibrary/icons",
    montar: (dados) =>
      (dados?.icons ?? []).map((icone) => ({
        nome: icone.name,
        tipo: "svg",
        grupo: icone.categories[0],
        categorias: icone.categories,
        autor: icone.author,
        svg: icone.svg,
      })),
  },
};
