// Configuração do Google AdSense.
//
// Preencha `cliente` com o ID de editor (ca-pub-…) e cada slot com o ID do
// bloco de anúncios criado no painel do AdSense. Com `cliente` vazio nenhum
// script do Google é carregado; em localhost as áreas aparecem como prévia.
export const ADS = {
  cliente: "", // ex.: "ca-pub-1234567890123456"
  slots: {
    // Laterais flutuantes, 160×600 — ficam paradas enquanto a página rola
    railLeft: "",
    railRight: "",
    // Faixa horizontal responsiva abaixo do cabeçalho — quando as laterais não
    // cabem (celulares, janelas estreitas ou baixas)
    banner: "",
  },
};
