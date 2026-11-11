// Núcleo de Unir, Subtrair, Interseção e Excluir, num script comum (sem
// import/export) para servir a dois lugares:
// - o Web Worker (js/workers/booleanas.worker.js), que o carrega com
//   importScripts junto com o Paper.js e faz as contas fora da página;
// - models/booleanas.js, que o importa e reexporta para os testes.
// Define globalThis.IconLibraryBooleanas = { OPERACOES, combinarCaminhos }.
(function () {
  "use strict";

  // Nome no editor → método do Paper.js
  var OPERACOES = {
    unir: "unite",
    subtrair: "subtract",
    intersecao: "intersect",
    excluir: "exclude",
  };

  // caminhos: textos de path na ordem do desenho (o de baixo primeiro). Unir
  // junta todos; as outras usam dois: o de baixo e o de cima (subtrair tira o
  // de cima do de baixo). Devolve o path do resultado, ou "" se não sobrar nada.
  function combinarCaminhos(paper, operacao, caminhos) {
    var metodo = OPERACOES[operacao];
    if (!metodo) throw new Error("Operação desconhecida: " + operacao);
    if (!Array.isArray(caminhos) || caminhos.length < 2) throw new Error("São precisas duas formas");
    if (operacao !== "unir" && caminhos.length !== 2) throw new Error("Esta operação usa exatamente duas formas");
    var novo = function (d) {
      return new paper.CompoundPath({ pathData: String(d), insert: false });
    };
    var resultado = novo(caminhos[0]);
    for (var i = 1; i < caminhos.length; i++) {
      var proximo = resultado[metodo](novo(caminhos[i]), { insert: false });
      resultado.remove();
      resultado = proximo;
    }
    // Três casas: o mesmo arredondamento do resto do editor
    var d = resultado.getPathData(null, 3);
    resultado.remove();
    return d;
  }

  globalThis.IconLibraryBooleanas = { OPERACOES: OPERACOES, combinarCaminhos: combinarCaminhos };
})();
