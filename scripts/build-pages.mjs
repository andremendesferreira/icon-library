// Gera as páginas de texto (Guia, Sobre, Privacidade, em todos os idiomas, e os
// guias dos conjuntos de ícones e os artigos, em inglês e português):
//
//   pages/<pagina>/<idioma>.html  →  public/<pagina>.html (inglês)
//                                    public/<pagina>.<idioma>.html (demais)
//
// Cada arquivo de pages/ começa com um comentário JSON com o título e a
// descrição da página, seguido do conteúdo do <main>. O cabeçalho (idioma,
// endereço canônico, versões em outros idiomas para os buscadores, prévia em
// redes sociais), o seletor de idioma e o rodapé saem daqui e dos
// dicionários em public/js/i18n/.
//
//   npm run pages            gera
//   npm run pages -- --check só confere se os arquivos estão em dia (testes)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITE = "https://iconlibrary.io";
const IDIOMAS = ["en", "es", "fr", "de", "ru", "zh-CN", "pt-BR", "ja"];
const PAGINAS = ["guide", "about", "privacy"];
// Ícones do rodapé (Bootstrap Icons, MIT): mesmo traço e cor dos links
const ICONE_RODAPE = {
  bug: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M4.355.522a.5.5 0 0 1 .623.333l.291.956A5 5 0 0 1 8 1c1.007 0 1.946.298 2.731.811l.29-.956a.5.5 0 1 1 .957.29l-.41 1.352A5 5 0 0 1 13 6h.5a.5.5 0 0 0 .5-.5V5a.5.5 0 0 1 1 0v.5A1.5 1.5 0 0 1 13.5 7H13v1h1.5a.5.5 0 0 1 0 1H13v1h.5a1.5 1.5 0 0 1 1.5 1.5v.5a.5.5 0 1 1-1 0v-.5a.5.5 0 0 0-.5-.5H13a5 5 0 0 1-10 0h-.5a.5.5 0 0 0-.5.5v.5a.5.5 0 1 1-1 0v-.5A1.5 1.5 0 0 1 2.5 10H3V9H1.5a.5.5 0 0 1 0-1H3V7h-.5A1.5 1.5 0 0 1 1 5.5V5a.5.5 0 0 1 1 0v.5a.5.5 0 0 0 .5.5H3c0-1.364.547-2.601 1.432-3.503l-.41-1.352a.5.5 0 0 1 .333-.623M4 7v4a4 4 0 0 0 3.5 3.97V7zm4.5 0v7.97A4 4 0 0 0 12 11V7zM12 6a4 4 0 0 0-1.334-2.982A3.98 3.98 0 0 0 8 2a3.98 3.98 0 0 0-2.667 1.018A4 4 0 0 0 4 6z"/></svg>',
  lightbulb: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M2 6a6 6 0 1 1 10.174 4.31c-.203.196-.359.4-.453.619l-.762 1.769A.5.5 0 0 1 10.5 13a.5.5 0 0 1 0 1 .5.5 0 0 1 0 1l-.224.447a1 1 0 0 1-.894.553H6.618a1 1 0 0 1-.894-.553L5.5 15a.5.5 0 0 1 0-1 .5.5 0 0 1 0-1 .5.5 0 0 1-.46-.302l-.761-1.77a2 2 0 0 0-.453-.618A5.98 5.98 0 0 1 2 6m6-5a5 5 0 0 0-3.479 8.592c.263.254.514.564.676.941L5.83 12h4.342l.632-1.467c.162-.377.413-.687.676-.941A5 5 0 0 0 8 1"/></svg>',
  telegram: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.595.442c-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294q.39.01.868-.32 3.269-2.206 3.374-2.23c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8 8 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629q.14.092.27.187c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.4 1.4 0 0 0-.013-.315.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09"/></svg>',
  github: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>',
};
const ROTULO = { guide: "footer.guide", about: "footer.about", privacy: "footer.privacy" };
// Um guia para cada conjunto de ícones, por enquanto só nos idiomas que o autor
// consegue revisar. O nome do conjunto também é o de pages/<pagina>/.
const CONJUNTOS = ["lucide-icons", "feather-icons", "bootstrap-icons", "emoji-icons"];
const IDIOMAS_CONJUNTOS = ["en", "pt-BR"];
const NOME_CONJUNTO = { "lucide-icons": "Lucide", "feather-icons": "Feather", "bootstrap-icons": "Bootstrap Icons", "emoji-icons": "Emoji" };
// Artigos: textos com a experiência do autor, nos mesmos idiomas dos guias
const ARTIGOS = ["lgpd-icon"];
const idiomasDe = (pagina) => (CONJUNTOS.includes(pagina) || ARTIGOS.includes(pagina) ? IDIOMAS_CONJUNTOS : IDIOMAS);
const raiz = new URL("../", import.meta.url);

const arquivo = (pagina, idioma) => `${pagina}${idioma === "en" ? "" : `.${idioma}`}.html`;
const escapar = (texto) =>
  String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dicionarios = {};
for (const idioma of IDIOMAS)
  dicionarios[idioma] = (await import(new URL(`public/js/i18n/${idioma}.js`, raiz))).default;
const t = (idioma, chave) => dicionarios[idioma][chave] ?? dicionarios.en[chave];

// Ícones escolhidos do conjunto, já no HTML: aparecem mesmo sem JavaScript
function grade(pagina) {
  const icones = JSON.parse(readFileSync(new URL(`pages/${pagina}/icones.json`, raiz), "utf8"));
  const itens = icones.map(
    ({ nome, svg, emoji }) => `<li>${svg ?? `<span class="set-grid__emoji">${emoji}</span>`}<small>${escapar(nome)}</small></li>`,
  );
  return `<ul class="set-grid">\n${itens.join("\n")}\n</ul>`;
}

// Botão que abre a ferramenta já no conjunto, e links para os outros guias
function ferramenta(chave, idioma, pagina) {
  const separador = idioma === "en" ? "?" : `?lang=${idioma}&amp;`;
  const outros = CONJUNTOS.filter((c) => c !== pagina)
    .map((c) => `<a href="${arquivo(c, idioma)}">${NOME_CONJUNTO[c]}</a>`)
    .join(" · ");
  return `<p class="page__cta"><a class="page__open" href="./${separador}set=${chave}">${escapar(t(idioma, "sets.open"))}</a></p>
<p class="page__meta">${escapar(t(idioma, "sets.others"))} ${outros}</p>`;
}

function montar(pagina, idioma) {
  const fonte = readFileSync(new URL(`pages/${pagina}/${idioma}.html`, raiz), "utf8").replace(/\r\n/g, "\n");
  const cabecalho = /^<!--\s*(\{.*?\})\s*-->\n/s.exec(fonte);
  if (!cabecalho) throw new Error(`pages/${pagina}/${idioma}.html: falta o comentário JSON com title/description`);
  const { title, description } = JSON.parse(cabecalho[1]);
  const icones = idioma === "en" ? "./" : `./?lang=${idioma}`;
  // <!--cafe--> no texto vira o botão do café
  const conteudo = fonte
    .slice(cabecalho[0].length)
    .trimEnd()
    .replace(
      "<!--cafe-->",
      `<p class="page__coffee"><a class="site-footer__coffee" href="${icones}#coffee">☕ ${escapar(t(idioma, "coffee.button"))}</a></p>`,
    )
    .replace("<!--grade-->", () => (CONJUNTOS.includes(pagina) ? grade(pagina) : ""))
    .replace(/<!--ferramenta:(\w+)-->/, (_, chave) => ferramenta(chave, idioma, pagina))
    .split("\n")
    .map((linha) => (linha ? `    ${linha}` : ""))
    .join("\n");
  const endereco = `${SITE}/${arquivo(pagina, idioma)}`;
  const versoes = idiomasDe(pagina).map(
    (l) => `  <link rel="alternate" hreflang="${l}" href="${SITE}/${arquivo(pagina, l)}" />`,
  ).join("\n");

  return `<!doctype html>
<!-- Gerado por scripts/build-pages.mjs a partir de pages/${pagina}/${idioma}.html — edite lá e rode npm run pages -->
<html
  lang="${idioma}"
  data-page="${pagina}"
  data-languages="${idiomasDe(pagina).join(",")}"
  data-label-to-dark="${escapar(t(idioma, "theme.toDark"))}"
  data-label-to-light="${escapar(t(idioma, "theme.toLight"))}"
>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="google-adsense-account" content="ca-pub-1124520097523749" />
  <meta name="description" content="${escapar(description)}" />
  <title>${escapar(title)}</title>
  <meta name="theme-color" content="#f5f7fb" />
  <link rel="canonical" href="${endereco}" />
${versoes}
  <link rel="alternate" hreflang="x-default" href="${SITE}/${arquivo(pagina, "en")}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Icon Library" />
  <meta property="og:url" content="${endereco}" />
  <meta property="og:title" content="${escapar(title)}" />
  <meta property="og:description" content="${escapar(description)}" />
  <meta property="og:image" content="${SITE}/img/og-image.png" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta name="twitter:card" content="summary" />
  <link rel="icon" href="favicon.ico" sizes="48x48" />
  <link rel="icon" type="image/png" href="img/favicon-32.png" sizes="32x32" />
  <link rel="apple-touch-icon" href="img/apple-touch-icon.png" />
  <link rel="stylesheet" href="css/icon-library.css" />
  <script src="js/i18n/detect.js"></script>
  <script src="js/views/theme.js"></script>
  <script src="js/views/clarity.js" async></script>
</head>
<body>
  <main class="page">
    <div class="page__top">
      <a class="page__back" href="${icones}">${escapar(t(idioma, "page.back"))}</a>
      <label class="lang-select">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></svg>
        <select id="lang-select" aria-label="${escapar(t(idioma, "lang.label"))}"></select>
      </label>
    </div>
${conteudo}
  </main>
  <footer class="site-footer">
    <nav aria-label="${escapar(t(idioma, "nav.label"))}">
      <a href="${icones}">${escapar(t(idioma, "footer.icons"))}</a>
${PAGINAS.filter((p) => p !== pagina)
  .map((p) => `      <a href="${arquivo(p, idioma)}">${escapar(t(idioma, ROTULO[p]))}</a>`)
  .join("\n")}
      <a class="site-footer__coffee" href="${icones}#coffee">☕ ${escapar(t(idioma, "coffee.button"))}</a>
      <span class="site-footer__quebra"></span>
      <a href="${icones}#report">${ICONE_RODAPE.bug}${escapar(t(idioma, "footer.report"))}</a>
      <a href="https://github.com/andremendesferreira/icon-library/discussions" target="_blank" rel="noopener">${ICONE_RODAPE.lightbulb}${escapar(t(idioma, "footer.ideas"))}</a>
      <a href="https://t.me/iconlibraryio" target="_blank" rel="noopener">${ICONE_RODAPE.telegram}${escapar(t(idioma, "footer.telegram"))}</a>
      <a href="https://github.com/andremendesferreira/icon-library" target="_blank" rel="noopener">${ICONE_RODAPE.github}${escapar(t(idioma, "footer.github"))}</a>
    </nav>
    <p class="site-footer__owner">© 2026 André M. Ferreira<span class="site-footer__version"><!--version--></span></p>
  </footer>
</body>
</html>
`;
}

const conferir = process.argv.includes("--check");
const desatualizados = [];
for (const pagina of [...PAGINAS, ...CONJUNTOS, ...ARTIGOS])
  for (const idioma of idiomasDe(pagina)) {
    const destino = new URL(`public/${arquivo(pagina, idioma)}`, raiz);
    const html = montar(pagina, idioma);
    const atual = existsSync(destino) ? readFileSync(destino, "utf8").replace(/\r\n/g, "\n") : null;
    if (atual === html) continue;
    if (conferir) desatualizados.push(arquivo(pagina, idioma));
    else writeFileSync(destino, html);
  }

if (conferir && desatualizados.length) {
  console.error(`Páginas desatualizadas: ${desatualizados.join(", ")}\nRode: npm run pages`);
  process.exit(1);
}
console.log(conferir ? "Páginas em dia." : "Páginas geradas.");
