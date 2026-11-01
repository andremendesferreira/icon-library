// Gera as páginas de texto (Guia, Sobre, Privacidade, em todos os idiomas, e os
// guias dos conjuntos de ícones, em inglês e português):
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
const ROTULO = { guide: "footer.guide", about: "footer.about", privacy: "footer.privacy" };
// Um guia para cada conjunto de ícones, por enquanto só nos idiomas que o autor
// consegue revisar. O nome do conjunto também é o de pages/<pagina>/.
const CONJUNTOS = ["lucide-icons", "feather-icons", "bootstrap-icons", "emoji-icons"];
const IDIOMAS_CONJUNTOS = ["en", "pt-BR"];
const NOME_CONJUNTO = { "lucide-icons": "Lucide", "feather-icons": "Feather", "bootstrap-icons": "Bootstrap Icons", "emoji-icons": "Emoji" };
const idiomasDe = (pagina) => (CONJUNTOS.includes(pagina) ? IDIOMAS_CONJUNTOS : IDIOMAS);
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
      <a href="${icones}#report">🐞 ${escapar(t(idioma, "footer.report"))}</a>
      <a href="https://github.com/andremendesferreira/icon-library/discussions" target="_blank" rel="noopener">💡 ${escapar(t(idioma, "footer.ideas"))}</a>
      <a href="https://t.me/iconlibraryio" target="_blank" rel="noopener">📣 ${escapar(t(idioma, "footer.telegram"))}</a>
      <a href="https://github.com/andremendesferreira/icon-library" target="_blank" rel="noopener">💻 ${escapar(t(idioma, "footer.github"))}</a>
    </nav>
    <p class="site-footer__owner">© 2026 André M. Ferreira<span class="site-footer__version"><!--version--></span></p>
  </footer>
</body>
</html>
`;
}

const conferir = process.argv.includes("--check");
const desatualizados = [];
for (const pagina of [...PAGINAS, ...CONJUNTOS])
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
