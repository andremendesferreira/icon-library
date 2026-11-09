// Microsoft Clarity: estatísticas de uso, mapas de calor e gravações de sessão.
// Fica de fora em localhost, para os testes não entrarem nas estatísticas.
// O que não pode aparecer nas gravações (códigos de apoiador, formulários,
// código SVG) leva data-clarity-mask="true" no index.html.
// Na Europa, no Reino Unido e na Suíça o Clarity roda sem cookies: o site não
// envia o sinal de consentimento (consentv2).
(function () {
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i + "?ref=bwt";
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", "zb5702vi2e");
})();
