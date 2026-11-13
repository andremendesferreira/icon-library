// Herói compacto para quem volta. Carregado no <head> (sem defer), como o
// theme.js, para a classe valer antes de a página aparecer: sem pulo de layout.
// "Já usou o site" = já copiou um ícone (icon-library:used, gravado pelo
// IconController) ou já escolheu um conjunto (icon-library:set). A primeira
// visita, e os robôs de busca, sempre veem a home completa.
(function () {
  "use strict";
  try {
    if (localStorage.getItem("icon-library:used") || localStorage.getItem("icon-library:set")) {
      document.documentElement.classList.add("volta");
    }
  } catch (e) {
    // Sem armazenamento: home completa
  }
})();
