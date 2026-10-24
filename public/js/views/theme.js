// Tema claro/escuro. Carregado no <head> (sem defer) para marcar o tema antes
// de a página aparecer — senão ela piscaria clara antes de escurecer.
// Sem escolha salva, segue o sistema operacional.
(function () {
  "use strict";
  var CHAVE = "icon-library:theme";
  var sistema = window.matchMedia("(prefers-color-scheme: dark)");

  function salvo() {
    try {
      return localStorage.getItem(CHAVE);
    } catch (e) {
      return null;
    }
  }

  function aplicar() {
    var tema = salvo() || (sistema.matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", tema);
    var botao = document.getElementById("theme-toggle");
    if (botao) {
      var escuro = tema === "dark";
      botao.setAttribute("aria-pressed", String(escuro));
      // Rótulos no idioma da página (gravados por js/i18n/i18n.js ou, nas
      // páginas de texto, já no HTML); inglês enquanto não chegam
      var rotulos = document.documentElement.dataset;
      botao.title = escuro
        ? rotulos.labelToLight || "Switch to light theme"
        : rotulos.labelToDark || "Switch to dark theme";
    }
  }

  aplicar();
  sistema.addEventListener("change", aplicar);
  document.addEventListener("i18n:pronto", aplicar);

  document.addEventListener("DOMContentLoaded", function () {
    aplicar();
    var botao = document.getElementById("theme-toggle");
    if (!botao) return;
    botao.addEventListener("click", function () {
      var novo =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light"
          : "dark";
      try {
        localStorage.setItem(CHAVE, novo);
      } catch (e) {}
      aplicar();
    });
  });
})();
