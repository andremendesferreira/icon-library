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
const PAGINAS = ["guide", "about", "privacy", "license"];
// Ícones do rodapé (Bootstrap Icons, MIT): mesmo traço e cor dos links
const ICONE_RODAPE = {
  bug: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M4.355.522a.5.5 0 0 1 .623.333l.291.956A5 5 0 0 1 8 1c1.007 0 1.946.298 2.731.811l.29-.956a.5.5 0 1 1 .957.29l-.41 1.352A5 5 0 0 1 13 6h.5a.5.5 0 0 0 .5-.5V5a.5.5 0 0 1 1 0v.5A1.5 1.5 0 0 1 13.5 7H13v1h1.5a.5.5 0 0 1 0 1H13v1h.5a1.5 1.5 0 0 1 1.5 1.5v.5a.5.5 0 1 1-1 0v-.5a.5.5 0 0 0-.5-.5H13a5 5 0 0 1-10 0h-.5a.5.5 0 0 0-.5.5v.5a.5.5 0 1 1-1 0v-.5A1.5 1.5 0 0 1 2.5 10H3V9H1.5a.5.5 0 0 1 0-1H3V7h-.5A1.5 1.5 0 0 1 1 5.5V5a.5.5 0 0 1 1 0v.5a.5.5 0 0 0 .5.5H3c0-1.364.547-2.601 1.432-3.503l-.41-1.352a.5.5 0 0 1 .333-.623M4 7v4a4 4 0 0 0 3.5 3.97V7zm4.5 0v7.97A4 4 0 0 0 12 11V7zM12 6a4 4 0 0 0-1.334-2.982A3.98 3.98 0 0 0 8 2a3.98 3.98 0 0 0-2.667 1.018A4 4 0 0 0 4 6z"/></svg>',
  lightbulb: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M2 6a6 6 0 1 1 10.174 4.31c-.203.196-.359.4-.453.619l-.762 1.769A.5.5 0 0 1 10.5 13a.5.5 0 0 1 0 1 .5.5 0 0 1 0 1l-.224.447a1 1 0 0 1-.894.553H6.618a1 1 0 0 1-.894-.553L5.5 15a.5.5 0 0 1 0-1 .5.5 0 0 1 0-1 .5.5 0 0 1-.46-.302l-.761-1.77a2 2 0 0 0-.453-.618A5.98 5.98 0 0 1 2 6m6-5a5 5 0 0 0-3.479 8.592c.263.254.514.564.676.941L5.83 12h4.342l.632-1.467c.162-.377.413-.687.676-.941A5 5 0 0 0 8 1"/></svg>',
  telegram: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.595.442c-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294q.39.01.868-.32 3.269-2.206 3.374-2.23c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8 8 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629q.14.092.27.187c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.4 1.4 0 0 0-.013-.315.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09"/></svg>',
  github: '<svg class="site-footer__icon" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>',
};
const ROTULO = { guide: "footer.guide", about: "footer.about", privacy: "footer.privacy", license: "footer.license", articles: "nav.articles" };
// No cabeçalho (como na home): Guia, Sobre e Artigos. Privacidade e Licenças
// ficam no rodapé.
const NO_TOPO = ["guide", "about", "articles"];
// Um guia para cada conjunto de ícones, por enquanto só nos idiomas que o autor
// consegue revisar. O nome do conjunto também é o de pages/<pagina>/.
const CONJUNTOS = ["lucide-icons", "feather-icons", "bootstrap-icons", "emoji-icons"];
const IDIOMAS_CONJUNTOS = ["en", "pt-BR"];
const NOME_CONJUNTO = { "lucide-icons": "Lucide", "feather-icons": "Feather", "bootstrap-icons": "Bootstrap Icons", "emoji-icons": "Emoji" };
// Artigos: textos com a experiência do autor, nos mesmos idiomas dos guias
const ARTIGOS = ["lgpd-icon"];
// A página que reúne os artigos (tipo blog), nos mesmos idiomas deles
const INDICE_ARTIGOS = "articles";
const idiomasDe = (pagina) =>
  CONJUNTOS.includes(pagina) || ARTIGOS.includes(pagina) || pagina === INDICE_ARTIGOS ? IDIOMAS_CONJUNTOS : IDIOMAS;
// Endereço de uma página no idioma, ou na versão em inglês quando ela não
// existe nele (Artigos, guias dos conjuntos)
const enderecoNo = (pagina, idioma) => arquivo(pagina, idiomasDe(pagina).includes(idioma) ? idioma : "en");
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

// Os três passos ilustrados da home (public/index.html), para o Guia: o HTML
// é o mesmo, com os textos já no idioma da página
const PASSOS = (() => {
  const html = readFileSync(new URL("public/index.html", raiz), "utf8").replace(/\r\n/g, "\n");
  const m = /<ol class="passos"[\s\S]*?<\/ol>/.exec(html);
  if (!m) throw new Error("public/index.html: falta o <ol class=\"passos\">");
  return m[0];
})();
function passos(idioma) {
  const lista = PASSOS
    .replace(/ data-i18n-attr="aria-label:([\w.]+)"/g, "")
    .replace(/aria-label="[^"]*"/, `aria-label="${escapar(t(idioma, "steps.label"))}"`)
    .replace(/ data-i18n="([\w.]+)">[^<]*</g, (_, chave) => `>${escapar(t(idioma, chave))}<`);
  return `<section class="page__passos" aria-labelledby="quick-start">
  <h2 id="quick-start">${escapar(t(idioma, "guide.quickStart"))}</h2>
  ${lista}
</section>`;
}

// Nome curto da página, para o breadcrumb
function nomeCurto(pagina, idioma, title) {
  if (ROTULO[pagina]) return t(idioma, ROTULO[pagina]);
  if (NOME_CONJUNTO[pagina]) return NOME_CONJUNTO[pagina];
  return title.split(" — ")[0];
}

// Avaliações dos apoiadores (página Sobre): a seção começa escondida e
// js/views/reviews.js a mostra quando o servidor tem a função ligada. Os
// textos vão junto, em JSON, no idioma da página.
function avaliacoes(idioma) {
  const x = (chave) => escapar(t(idioma, chave));
  const textos = Object.fromEntries(
    Object.keys(dicionarios.en)
      .filter((c) => c.startsWith("reviews."))
      .map((c) => [c, t(idioma, c)]),
  );
  const estrelas = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<label class="estrelas__opcao"><input type="radio" name="rating" value="${n}" /><span aria-hidden="true">★</span><span class="visually-hidden">${escapar(t(idioma, "reviews.stars").replace("{n}", n))}</span></label>`,
    )
    .join("");
  return `<section id="avaliar" class="avaliacoes" aria-labelledby="avaliacoes-titulo" hidden>
  <h2 id="avaliacoes-titulo">${x("reviews.title")}</h2>
  <p>${x("reviews.intro")}</p>
  <p class="avaliacoes__regra">${x("reviews.policy")}</p>
  <p class="avaliacoes__resumo" id="avaliacoes-resumo"></p>
  <ul class="avaliacoes__lista" id="avaliacoes-lista"></ul>
  <p class="avaliacoes__situacao" id="avaliacoes-situacao" role="status"></p>
  <p><button type="button" class="avaliacoes__escrever" id="avaliacoes-escrever">${x("reviews.write")}</button></p>
  <dialog id="avaliacao" class="avaliacao" aria-labelledby="avaliacao-titulo" data-clarity-mask="true">
    <form id="avaliacao-form" class="avaliacao__form" novalidate>
      <h2 id="avaliacao-titulo">${x("reviews.write")}</h2>
      <p class="avaliacao__dica">${x("reviews.formIntro")}</p>
      <label class="avaliacao__campo">${x("reviews.code")}
        <input id="avaliacao-codigo" autocomplete="off" spellcheck="false" placeholder="CAFE-XXXX-XXXX" aria-describedby="avaliacao-codigo-dica" />
      </label>
      <p class="avaliacao__dica" id="avaliacao-codigo-dica">${x("reviews.codeHint")}</p>
      <fieldset class="estrelas" id="avaliacao-estrelas">
        <legend>${x("reviews.rating")}</legend>
        <div class="estrelas__linha">${estrelas}</div>
      </fieldset>
      <label class="avaliacao__campo">${x("reviews.comment")}
        <textarea id="avaliacao-comentario" rows="4" maxlength="600" aria-describedby="avaliacao-contador"></textarea>
      </label>
      <p class="avaliacao__dica" id="avaliacao-contador"></p>
      <fieldset class="avaliacao__quem">
        <legend>${x("reviews.appear")}</legend>
        <div class="avaliacao__logins" id="avaliacao-logins"></div>
        <p class="avaliacao__verificado" id="avaliacao-verificado" hidden><span id="avaliacao-verificado-texto"></span> <button type="button" class="avaliacao__link" id="avaliacao-sem-login">${x("reviews.dropLogin")}</button></p>
        <p class="avaliacao__dica" id="avaliacao-login-dica">${x("reviews.loginHint")}</p>
        <label class="avaliacao__campo">${x("reviews.name")}
          <input id="avaliacao-nome" maxlength="40" autocomplete="name" />
        </label>
        <div class="avaliacao__foto">
          <span class="avatar avatar--grande" id="avaliacao-avatar" aria-hidden="true"></span>
          <div>
            <p class="avaliacao__rotulo">${x("reviews.photo")}</p>
            <label class="avaliacao__botao">${x("reviews.photoUpload")}<input type="file" id="avaliacao-arquivo" class="visually-hidden" accept="image/png,image/jpeg,image/webp" /></label>
            <button type="button" class="avaliacao__link" id="avaliacao-tirar-foto" hidden>${x("reviews.photoRemove")}</button>
          </div>
        </div>
        <p class="avaliacao__dica">${x("reviews.photoHint")}</p>
      </fieldset>
      <label class="avaliacao__consentimento"><input type="checkbox" id="avaliacao-consentimento" /> ${x("reviews.consent")}</label>
      <input name="website" class="avaliacao__isca" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <p class="avaliacao__erro" id="avaliacao-erro" role="alert"></p>
      <div class="avaliacao__acoes">
        <button type="button" class="avaliacao__secundario" id="avaliacao-cancelar">${x("reviews.cancel")}</button>
        <button type="submit" class="avaliacao__enviar" id="avaliacao-enviar">${x("reviews.send")}</button>
      </div>
    </form>
  </dialog>
  <script type="application/json" id="avaliacoes-textos">${JSON.stringify(textos).replace(/</g, "\\u003c")}</script>
</section>
<script type="module" src="js/views/reviews.js"></script>`;
}

// Lista dos artigos (página Artigos): título, data e resumo de cada um, tirados
// do próprio artigo no idioma da página; os mais novos primeiro
function listaDeArtigos(idioma) {
  const itens = [...ARTIGOS].reverse().map((artigo) => {
    const fonte = readFileSync(new URL(`pages/${artigo}/${idioma}.html`, raiz), "utf8").replace(/\r\n/g, "\n");
    const { title, description } = JSON.parse(/^<!--\s*(\{.*?\})\s*-->/s.exec(fonte)[1]);
    const data = /<p class="page__meta">([\s\S]*?)<\/p>/.exec(fonte)?.[1].trim() ?? "";
    return `<li class="artigos__item">
  <h2 class="artigos__titulo"><a href="${arquivo(artigo, idioma)}">${escapar(title.split(" | ")[0])}</a></h2>
  ${data ? `<p class="page__meta">${data}</p>` : ""}
  <p>${escapar(description)}</p>
</li>`;
  });
  return `<ul class="artigos">\n${itens.join("\n")}\n</ul>`;
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
    .replace("<!--avaliacoes-->", () => avaliacoes(idioma))
    .replace("<!--passos-->", () => passos(idioma))
    .replace("<!--artigos-->", () => listaDeArtigos(idioma))
    .replace(/<!--ferramenta:(\w+)-->/, (_, chave) => ferramenta(chave, idioma, pagina))
    .split("\n")
    .map((linha) => (linha ? `    ${linha}` : ""))
    .join("\n");
  const endereco = `${SITE}/${arquivo(pagina, idioma)}`;
  // Breadcrumb: Icon Library › página, na tela e para os buscadores
  const atual = nomeCurto(pagina, idioma, title);
  const inicio = idioma === "en" ? `${SITE}/` : `${SITE}/?lang=${idioma}`;
  const trilhaLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Icon Library", item: inicio },
      { "@type": "ListItem", position: 2, name: atual, item: endereco },
    ],
  }).replace(/</g, "\\u003c");
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
  <script type="application/ld+json">${trilhaLd}</script>
  <script src="js/i18n/detect.js"></script>
  <script src="js/views/theme.js"></script>
  <script src="js/views/clarity.js" async></script>
  <script src="js/views/pageSearch.js" defer></script>
  <script src="js/views/profundidade.js" defer></script>
</head>
<body>
  <!-- O mesmo cabeçalho da home: logo, Guia, Sobre, Artigos, café, idioma, tema -->
  <header class="topo topo--fixo">
    <a class="topo__marca" href="${icones}" aria-label="Icon Library" title="Icon Library">
      <span class="topo__selo" aria-hidden="true"><img src="img/logo-180.webp" srcset="img/logo-180.webp 1x, img/logo-360.webp 2x" width="48" height="48" alt="" class="topo__logo" /><span class="topo__brilho"></span></span>
      <span class="visually-hidden">Icon Library</span>
    </a>
    <nav class="topo__nav" aria-label="${escapar(t(idioma, "nav.label"))}">
${NO_TOPO.map((p) => `        <a class="topo__link" href="${enderecoNo(p, idioma)}"${p === pagina ? ' aria-current="page"' : ""}>${escapar(t(idioma, ROTULO[p]))}</a>`).join("\n")}
      <a class="coffee-button" href="${icones}#coffee"><span aria-hidden="true">☕</span><span class="coffee-button__text">${escapar(t(idioma, "coffee.button"))}</span></a>
      <label class="lang-select">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></svg>
        <select id="lang-select" aria-label="${escapar(t(idioma, "lang.label"))}"></select>
      </label>
      <button type="button" id="theme-toggle" class="theme-toggle" aria-label="${escapar(t(idioma, "theme.label"))}" aria-pressed="false">
        <svg class="theme-toggle__moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
        <svg class="theme-toggle__sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></svg>
      </button>
    </nav>
  </header>
  <main class="page">
    <div class="page__top">
      <form class="page__busca" action="./" role="search">
        ${idioma === "en" ? "" : `<input type="hidden" name="lang" value="${idioma}" />`}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input type="search" id="page-search" name="q" required aria-keyshortcuts="/" placeholder="${escapar(t(idioma, "page.search"))}" aria-label="${escapar(t(idioma, "search.label"))}" />
      </form>
    </div>
    <nav class="page__trilha" aria-label="${escapar(t(idioma, "breadcrumb.label"))}">
      <ol>
        <li><a href="${icones}">Icon Library</a></li>
        <li aria-current="page">${escapar(atual)}</li>
      </ol>
    </nav>
${conteudo}
  </main>
  <footer class="site-footer">
    <nav aria-label="${escapar(t(idioma, "nav.label"))}">
      <a href="${icones}">${escapar(t(idioma, "footer.icons"))}</a>
${PAGINAS.filter((p) => p !== pagina && !NO_TOPO.includes(p))
  .map((p) => `      <a href="${arquivo(p, idioma)}">${escapar(t(idioma, ROTULO[p]))}</a>`)
  .join("\n")}
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
for (const pagina of [...PAGINAS, ...CONJUNTOS, ...ARTIGOS, INDICE_ARTIGOS])
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
