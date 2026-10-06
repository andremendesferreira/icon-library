// Conjuntos de ícones disponíveis: de onde vêm os dados e como viram itens.
// Para adicionar um conjunto, basta declarar uma nova entrada em FONTES.

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
    rotuloGrupo: "All categories",
    url: "https://unpkg.com/unicode-emoji-json/data-by-emoji.json",
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
    rotuloGrupo: "All categories",
    rotuloGrupoAlternativo: "All letters",
    url: [
      "https://unpkg.com/lucide-static/icon-nodes.json",
      { endereco: "https://lucide.dev/api/categories", opcional: true },
    ],
    montar: ([icones, categorias]) =>
      Object.entries(icones).map(([nome, nos]) => ({
        nome: nome.replace(/-/g, " "),
        tipo: "svg",
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
    rotuloGrupo: "All categories",
    rotuloGrupoAlternativo: "All letters",
    url: [
      "https://unpkg.com/feather-icons/dist/icons.json",
      { endereco: "json/icons-categories.json", opcional: true },
    ],
    montar: ([icones, categorias]) =>
      Object.entries(icones).map(([nome, conteudo]) => ({
        nome: nome.replace(/-/g, " "),
        tipo: "svg",
        grupo:
          categorias?.feather?.[nome]?.[0] ||
          (categorias ? "others" : porLetra(nome)),
        svg: envelopeTraco(conteudo),
      })),
  },
  bootstrap: {
    rotulo: "Bootstrap",
    rotuloGrupo: "All categories",
    rotuloGrupoAlternativo: "All letters",
    url: [
      {
        endereco: "https://unpkg.com/bootstrap-icons/bootstrap-icons.svg",
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
};
