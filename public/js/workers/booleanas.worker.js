// Web Worker de Unir, Subtrair, Interseção e Excluir. O Paper.js faz as contas
// aqui, fora da página: uma forma muito auto-intersectante pode levar minutos,
// e então quem chama (controllers/combinarNoWorker.js) encerra o worker no
// tempo-limite, sem a aba travar.
//
// Recebe { id, operacao, caminhos } e responde { id, d } ou { id, erro }.
importScripts("../vendor/paper-core.min.js", "../models/booleanasNucleo.js");

var pronto = false;

self.onmessage = function (evento) {
  var pedido = evento.data || {};
  try {
    if (!pronto) {
      // Um projeto sem tela: só para as contas de geometria
      paper.setup(new paper.Size(1, 1));
      pronto = true;
    }
    var d = self.IconLibraryBooleanas.combinarCaminhos(paper, pedido.operacao, pedido.caminhos);
    self.postMessage({ id: pedido.id, d: d });
  } catch (erro) {
    self.postMessage({ id: pedido.id, erro: String((erro && erro.message) || erro) });
  }
};
