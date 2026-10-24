// Idioma da página. Carregado no <head> de todas as páginas (sem defer), antes
// de elas aparecerem. Escolhe o idioma, nesta ordem:
//   1. ?lang=xx no endereço (não é guardado: serve para links e buscadores);
//   2. a escolha feita no seletor, guardada no navegador;
//   3. o idioma do navegador (navigator.languages);
//   4. inglês.
// Também liga o seletor de idioma (#lang-select) e, nas páginas de texto em
// inglês (about.html, privacy.html), leva à versão no idioma escolhido.
(function () {
  "use strict";
  var IDIOMAS = [
    ["en", "English"],
    ["es", "Español"],
    ["fr", "Français"],
    ["de", "Deutsch"],
    ["ru", "Русский"],
    ["zh-CN", "中文（简体）"],
    ["pt-BR", "Português (Brasil)"],
    ["ja", "日本語"],
  ];
  var PADRAO = "en";
  var CHAVE = "icon-library:lang";
  var html = document.documentElement;

  // "pt-PT" → "pt-BR", "zh-TW" → "zh-CN", "EN-us" → "en": mesmo código ou, se
  // não houver, a mesma língua
  function suportado(tag) {
    if (!tag) return null;
    var pedido = String(tag).toLowerCase();
    var base = pedido.split("-")[0];
    var porBase = null;
    for (var i = 0; i < IDIOMAS.length; i++) {
      var codigo = IDIOMAS[i][0];
      if (codigo.toLowerCase() === pedido) return codigo;
      if (!porBase && codigo.split("-")[0].toLowerCase() === base) porBase = codigo;
    }
    return porBase;
  }

  function salvo() {
    try {
      return suportado(localStorage.getItem(CHAVE));
    } catch (e) {
      return null;
    }
  }

  function doEndereco() {
    var m = /[?&]lang=([^&#]+)/.exec(location.search);
    return m ? suportado(decodeURIComponent(m[1])) : null;
  }

  function doNavegador() {
    var lista = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (var i = 0; i < lista.length; i++) {
      var codigo = suportado(lista[i]);
      if (codigo) return codigo;
    }
    return null;
  }

  // Nome do arquivo de uma página de texto: about.html, about.pt-BR.html…
  function pagina(nome, idioma) {
    return nome + (idioma === PADRAO ? "" : "." + idioma) + ".html";
  }

  var doLink = doEndereco();
  var atual = doLink || salvo() || doNavegador() || PADRAO;
  var paginaDeTexto = html.getAttribute("data-page");

  window.IconLibraryLang = {
    idiomas: IDIOMAS,
    padrao: PADRAO,
    atual: atual,
    pagina: pagina,
    suportado: suportado,
  };

  if (paginaDeTexto) {
    // A versão em inglês é a página "padrão" (x-default): quem chega nela
    // sem ter escolhido inglês vai para o próprio idioma. As traduzidas
    // ficam como estão — foram abertas de propósito.
    if (html.lang === PADRAO && atual !== PADRAO && !doLink)
      location.replace(pagina(paginaDeTexto, atual) + location.hash);
  } else {
    // Página principal: traduzida no lugar por js/i18n/i18n.js. Até lá ela
    // fica escondida, para não piscar em inglês — com um limite, para nunca
    // ficar em branco se a tradução falhar.
    html.lang = atual;
    if (atual !== PADRAO) {
      html.classList.add("i18n-pendente");
      setTimeout(function () {
        html.classList.remove("i18n-pendente");
      }, 2500);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var seletor = document.getElementById("lang-select");
    if (!seletor) return;
    var mostrado = paginaDeTexto ? html.lang : atual;
    for (var i = 0; i < IDIOMAS.length; i++) {
      var opcao = document.createElement("option");
      opcao.value = IDIOMAS[i][0];
      opcao.lang = IDIOMAS[i][0];
      opcao.textContent = IDIOMAS[i][1];
      seletor.appendChild(opcao);
    }
    seletor.value = mostrado;
    seletor.addEventListener("change", function () {
      var escolhido = seletor.value;
      try {
        localStorage.setItem(CHAVE, escolhido);
      } catch (e) {}
      if (paginaDeTexto) {
        location.href = pagina(paginaDeTexto, escolhido);
        return;
      }
      // Recarrega no novo idioma, sem um ?lang= antigo que o contrariaria
      var url = new URL(location.href);
      url.searchParams.delete("lang");
      location.replace(url.href);
    });
  });
})();
