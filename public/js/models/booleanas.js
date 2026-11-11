// Operações de Combinar entre formas fechadas: unir, subtrair, interseção e
// excluir. Quem calcula é o Paper.js (public/js/vendor/paper-core.min.js,
// MIT), que mantém as curvas: um círculo menos uma barra continua com arcos.
//
// Sem DOM: recebe o objeto paper já carregado (no navegador, por
// controllers/carregarPaper.js; nos testes, pelo pacote npm "paper").

// Nome no editor → método do Paper.js
export const OPERACOES = {
  unir: "unite",
  subtrair: "subtract",
  intersecao: "intersect",
  excluir: "exclude",
};

// caminhos: textos de path na ordem do desenho (o de baixo primeiro). Unir
// junta todos; as outras usam dois: o de baixo e o de cima (subtrair tira o
// de cima do de baixo). Devolve o path do resultado, ou "" se não sobrar nada.
export function combinarCaminhos(paper, operacao, caminhos) {
  const metodo = OPERACOES[operacao];
  if (!metodo) throw new Error(`Operação desconhecida: ${operacao}`);
  if (!Array.isArray(caminhos) || caminhos.length < 2) throw new Error("São precisas duas formas");
  if (operacao !== "unir" && caminhos.length !== 2) throw new Error("Esta operação usa exatamente duas formas");
  const novo = (d) => new paper.CompoundPath({ pathData: d, insert: false });
  let resultado = novo(caminhos[0]);
  for (const d of caminhos.slice(1)) {
    const proximo = resultado[metodo](novo(d), { insert: false });
    resultado.remove();
    resultado = proximo;
  }
  // Três casas: o mesmo arredondamento do resto do editor
  const d = resultado.getPathData(null, 3);
  resultado.remove();
  return d;
}
