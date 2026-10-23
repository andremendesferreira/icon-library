// Configuração do Google AdSense.
//
// Preencha `cliente` com o ID de editor (ca-pub-…) e cada slot com o ID do
// bloco de anúncios criado no painel do AdSense. Com `cliente` vazio nenhum
// script do Google é carregado; em localhost as áreas aparecem como prévia.
export const ADS = {
  cliente: "ca-pub-1124520097523749", // ex.: "ca-pub-1234567890123456"

  slots: {
    // Laterais flutuantes, 160×600 — ficam paradas enquanto a página rola
    railLeft: "6444000633",
    railRight: "6994042850",

    // Faixa horizontal responsiva abaixo do cabeçalho — quando as laterais não
    // cabem (celulares, janelas estreitas ou baixas)
    banner: "6016003107",

    // Dentro da gaveta do scratchpad, ao lado do texto, 160×600 — só com ela
    // aberta e em janelas com altura para ele
    scratchpad: "7429779249",
  },
};
