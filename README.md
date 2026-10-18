<p align="center">
  <img src="public/img/iconlibrary.png" alt="Icon Library" width="160">
</p>

<h1 align="center">Icon Library</h1>

<p align="center">
  <a href="#english">English</a> · <a href="#português">Português</a>
</p>

---

## English

A page for browsing, filtering and copying icons from four sets — **Emoji (Unicode)**, **Lucide**, **Feather** and **Bootstrap Icons** — to use in menus and interfaces. Click an icon to copy its SVG; right-click to copy the alternative.

No framework, no build step, no runtime dependencies: plain HTML, CSS and JavaScript (ES modules, organized as MVC), served by a small Node.js server.

### Features

- **Four icon sets** in one place, loaded on demand and cached after the first load. Package versions are pinned (see [Icon versions](#icon-versions)).
- **Categories** with multi-select, and **search** by name.
- **Style before copying:** size, stroke width (Lucide, Feather) and color (all vector sets). Applied to everything copied, downloaded or sent to the scratchpad; the preview follows stroke and color. Remembered between visits.
- **Card buttons:**
  - **+** adds the icon to the scratchpad;
  - **⋯** opens *Download SVG*, *Download PNG* (at the chosen size) and *Copy as React component*;
  - the **pencil** (Lucide and Feather) opens the icon in [Lucide Studio](https://studio.lucide.dev), the online editor for Lucide-style icons.
- **Scratchpad:** a drawer on the right edge (tab or *Open Scratchpad*) that collects icons as `<!-- name -->` followed by the SVG. *Copy all* and *Clear* at the bottom; the text is kept in the browser.
- **Shareable searches:** the address follows the set and search (`?set=lucide&q=arrow`).
- **Light and dark themes:** follows the system, with a toggle in the header.
- **Emoji glyph detection:** emojis your system font cannot draw are flagged and can be hidden.
- **Fast with large sets:** only categories near the screen are drawn; the rest are drawn as you scroll.
- **About & guide** and **Privacy** pages, linked in the footer.
- **Responsive** from 360 px phones to wide desktops; keyboard support (arrows in the set list, `Esc` closes panels).

### Icon sets

| Set | Source | Categories | License |
|---|---|---|---|
| Emoji (Unicode) | [unicode-emoji-json](https://github.com/muan/unicode-emoji-json) | Official Unicode groups | MIT |
| Lucide | [lucide-static](https://lucide.dev) | Official, from the Lucide API | ISC |
| Feather | [feather-icons](https://feathericons.com) | Generated — `public/json/icons-categories.json` | MIT |
| Bootstrap Icons | [bootstrap-icons](https://icons.getbootstrap.com) | Generated — `public/json/icons-categories.json` | MIT |

Icon data is fetched at runtime from [unpkg](https://unpkg.com) (and the Lucide categories from `lucide.dev`), so the page needs internet access.

### Getting started

Requires **Node.js 20+**.

```bash
npm start      # → http://localhost:8080   (another port: PORT=3000 npm start)
npm test       # unit and server tests
```

> Opened straight from disk (`file://`), the page does not work: browsers block ES modules and the categories file there, and copying only works on `https://` or `localhost`.

### Running with Docker

```bash
docker compose up -d --build                                              # production
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build # development: serves local files, no rebuild
```

The production container runs as a non-root user, with a read-only file system, no Linux capabilities, memory and process limits, and a healthcheck. Environment variables (in `docker-compose.yml`):

| Variable | Purpose |
|---|---|
| `SITE_URL` | Public address — `https://iconlibrary.io` — used in `/sitemap.xml` and `/robots.txt`. Without it, the address of each request is used. |
| `ADSENSE_PUBLISHER_ID` | Your `pub-…` ID. Enables `/ads.txt`, required by AdSense. |

### Deploying

- **HTTPS is required:** browsers only allow copying on secure pages. Put a reverse proxy with a certificate (Nginx, Caddy, Traefik…) in front of port 3000.
- **The server** (`scripts/server.js`) adds security headers, gzip, cache headers (pages revalidated on every visit, other files cached for a day with ETag), answers only `GET`/`HEAD`, rejects malformed addresses and never serves anything outside `public/`. It also generates `/robots.txt`, `/sitemap.xml` and `/ads.txt`.
- **Address:** the site is published at **https://iconlibrary.io**. The pages declare it as their canonical address and in the social-preview tags (`og:url`, `og:image`); if the domain changes, update `public/*.html` and `SITE_URL`.
- Other static hosts (GitHub Pages, Netlify) can serve `public/` too, but without the generated routes and the headers above.

### Advertising (Google AdSense)

Ad areas, never all at once:

- **Side rails:** two floating 160×600 rails, left and right, that stay in place while the page scrolls; the content narrows so nothing is covered.
- **Banner:** a horizontal banner below the header, used instead when the rails do not fit (window narrower than 1100 px or shorter than 630 px, e.g. phones).
- **Scratchpad:** a 160×600 unit inside the scratchpad drawer, next to the text. It is requested only once the drawer opens, and shown in windows at least 640 px wide and 750 px tall. While the drawer is open, the right rail is hidden.

They stay off until configured. To turn them on:

1. In `public/js/models/adsConfig.js`, fill in `cliente` (`ca-pub-…`) and the slot of each unit created in AdSense: three fixed 160×600 display units (two rails and the scratchpad) and one responsive display unit (banner). An area with an empty slot is not shown.
2. Set `ADSENSE_PUBLISHER_ID` so `/ads.txt` is served.
3. In the AdSense panel, under *Privacy & messaging*, enable the consent message for Europe (the code needs no change).
4. Review `public/privacy.html` — it describes the cookies used by AdSense, but it is a template: adapt it to who runs the site.

With `cliente` empty no Google script is loaded; on `localhost` the areas show as dashed previews.

### Icon versions

The packages are pinned in `VERSOES` at the top of `public/js/models/iconSets.js`, so a new release cannot break the page on its own. To upgrade:

1. Change the version in `VERSOES` and, for Feather and Bootstrap, the same version in `scripts/generate-icon-categories.js`.
2. Run `npm run generate` (refreshes the categories) and `npm test` — a test fails if the two files disagree.
3. Check the page in the browser.

### Categories for Feather and Bootstrap

Neither Feather nor Bootstrap Icons publish categories; Lucide does, and since Lucide is a fork of Feather most names match. `scripts/generate-icon-categories.js` builds `public/json/icons-categories.json` by trying, in order:

| Strategy | Meaning |
|---|---|
| `exact` | Same name exists in Lucide — its categories are inherited |
| `tokens` | Same words in a different order (`alert-circle` ↔ `circle-alert`) |
| `base` | Same as above after removing a variant suffix (`house-fill` → `house`) |
| `approximate` | Keyword rules in the generator — an inference, not official data |
| `uncategorized` | Nothing matched — the icon goes to `others` |

Current coverage:

| Set | Icons | exact | tokens | base | approximate | uncategorized |
|---|---:|---:|---:|---:|---:|---:|
| Feather | 287 | 220 | 25 | 0 | 27 | 15 |
| Bootstrap | 2078 | 282 | 31 | 265 | 1500 | 0 |

The generated file is committed, so the page does not depend on the generator. If it cannot be loaded, Feather and Bootstrap icons are grouped by first letter instead.

### Adding an icon set

Sets are declared in `FONTES`, in `public/js/models/iconSets.js`. Each entry has:

| Field | Description |
|---|---|
| `rotulo` | Name shown in the set list |
| `rotuloGrupo` | Label of the category button when nothing is selected |
| `rotuloGrupoAlternativo` | Label used when the categories source is unavailable (grouped by letter) |
| `url` | One URL, or a list; each item is a string or `{ endereco, opcional, resposta: "texto" }` (`opcional`: failure is tolerated; `resposta: "texto"`: read as text) |
| `montar(data)` | Turns the downloaded data into items: `{ nome, tipo: "svg" \| "emoji", grupo, svg \| char, versao?, editavel? }` — `editavel: true` shows the Lucide Studio pencil (24×24 stroke icons only) |
| `temTraco`, `temCor` | `true` enables the stroke and color controls for the set |
| `detectaGlifo` | `true` to check whether the system font can draw each item (emoji only) |

### Tests and CI

`npm test` runs the tests in `tests/` with Node's built-in runner — SVG transformations, filters, HTML escaping, the scratchpad, pinned versions, and the server (malformed addresses, path traversal, headers, gzip, ETag, generated routes). On GitHub, `.github/workflows/ci.yml` runs them on every push and pull request, checks the syntax of every script, and builds the Docker image and waits for its healthcheck.

### Project structure

```
icon-library/
├── public/                             the site
│   ├── index.html                      main page
│   ├── about.html, privacy.html        guide and privacy policy
│   ├── css/icon-library.css            styles (light and dark)
│   ├── js/app.js                       entry point — wires models, views, controllers
│   ├── js/models/                      data and rules, no DOM
│   │   ├── iconSets.js                 the icon sets (FONTES) and pinned versions
│   │   ├── IconModel.js                loading, cache, filters, style, Studio link
│   │   ├── svgTools.js                 size/stroke/color, React, file names
│   │   ├── ScratchpadModel.js          scratchpad text, saved in the browser
│   │   ├── adsConfig.js                AdSense publisher and slot IDs
│   │   └── glyphDetector.js            can the system font draw this emoji?
│   ├── js/views/                       everything that touches the DOM
│   │   ├── IconView.js                 grid, panels, card menu, style controls
│   │   ├── ScratchpadView.js           scratchpad drawer
│   │   ├── AdsView.js                  ad areas
│   │   ├── html.js                     HTML escaping
│   │   ├── theme.js                    light/dark theme (all pages)
│   │   └── goTop.js                    "back to top" button
│   ├── js/controllers/
│   │   ├── IconController.js           user actions → model → view, address state
│   │   ├── ScratchpadController.js     open/close, add, copy, clear
│   │   ├── clipboard.js                copy to the clipboard
│   │   └── download.js                 SVG and PNG downloads
│   ├── img/iconlibrary.png             logo and favicon
│   └── json/icons-categories.json      generated categories (Feather, Bootstrap)
├── scripts/server.js                   server (npm start)
├── scripts/generate-icon-categories.js category generator
├── tests/                              npm test
├── .github/workflows/ci.yml            continuous integration
├── Dockerfile, docker-compose*.yml     container
└── package.json
```

`public/js/package.json` only marks the folder as ES modules, so Node can import those files in the tests.

### Credits

Icon Library is created and maintained by **André M. Ferreira** ([iconlibrary.io](https://iconlibrary.io)).

Icons belong to their authors and are used under their licenses: [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) (ISC), [Feather](https://github.com/feathericons/feather/blob/main/LICENSE) (MIT), [Bootstrap Icons](https://github.com/twbs/icons/blob/main/LICENSE) (MIT) and [unicode-emoji-json](https://github.com/muan/unicode-emoji-json/blob/main/LICENSE) (MIT). Emoji rendering depends on the fonts installed on each system.

---

## Português

Uma página para navegar, filtrar e copiar ícones de quatro conjuntos — **Emoji (Unicode)**, **Lucide**, **Feather** e **Bootstrap Icons** — para usar em menus e interfaces. Clique num ícone para copiar o SVG; clique com o botão direito para copiar a alternativa.

Sem framework, sem build, sem dependências em produção: HTML, CSS e JavaScript puros (módulos ES, organizados em MVC), servidos por um pequeno servidor Node.js.

### Recursos

- **Quatro conjuntos** num só lugar, carregados sob demanda e guardados em cache depois da primeira carga. As versões dos pacotes são fixas (veja [Versões dos ícones](#versões-dos-ícones)).
- **Categorias** com seleção múltipla e **busca** pelo nome.
- **Estilo antes de copiar:** tamanho, espessura do traço (Lucide, Feather) e cor (todos os vetoriais). Vale para tudo o que é copiado, baixado ou enviado ao scratchpad; a prévia acompanha traço e cor. Fica lembrado entre visitas.
- **Botões do card:**
  - **+** envia o ícone ao scratchpad;
  - **⋯** abre *Download SVG*, *Download PNG* (no tamanho escolhido) e *Copy as React component*;
  - o **lápis** (Lucide e Feather) abre o ícone no [Lucide Studio](https://studio.lucide.dev), o editor online de ícones no estilo Lucide.
- **Scratchpad:** uma gaveta na borda direita (aba ou *Open Scratchpad*) que junta ícones como `<!-- nome -->` seguido do SVG. *Copy all* e *Clear* na base; o texto fica guardado no navegador.
- **Buscas compartilháveis:** o endereço acompanha o conjunto e a busca (`?set=lucide&q=arrow`).
- **Tema claro e escuro:** segue o sistema, com um botão no cabeçalho.
- **Detecção de glifo nos emojis:** emojis que a fonte do sistema não desenha são sinalizados e podem ser ocultados.
- **Rápida com conjuntos grandes:** só as categorias perto da tela são desenhadas; as demais, conforme a rolagem.
- Páginas **Sobre e guia** e **Privacidade**, com links no rodapé.
- **Responsiva** de celulares de 360 px a monitores largos; teclado (setas na lista de conjuntos, `Esc` fecha painéis).

### Conjuntos de ícones

| Conjunto | Origem | Categorias | Licença |
|---|---|---|---|
| Emoji (Unicode) | [unicode-emoji-json](https://github.com/muan/unicode-emoji-json) | Grupos oficiais do Unicode | MIT |
| Lucide | [lucide-static](https://lucide.dev) | Oficiais, pela API do Lucide | ISC |
| Feather | [feather-icons](https://feathericons.com) | Geradas — `public/json/icons-categories.json` | MIT |
| Bootstrap Icons | [bootstrap-icons](https://icons.getbootstrap.com) | Geradas — `public/json/icons-categories.json` | MIT |

Os dados dos ícones são baixados em tempo de execução pelo [unpkg](https://unpkg.com) (e as categorias do Lucide pelo `lucide.dev`), então a página precisa de internet.

### Como rodar

Requer **Node.js 20+**.

```bash
npm start      # → http://localhost:8080   (outra porta: PORT=3000 npm start)
npm test       # testes de unidade e do servidor
```

> Aberta direto do disco (`file://`), a página não funciona: o navegador bloqueia ali os módulos ES e o arquivo de categorias, e a cópia só funciona em `https://` ou `localhost`.

### Rodando com Docker

```bash
docker compose up -d --build                                              # produção
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build # desenvolvimento: serve os arquivos locais, sem rebuild
```

O container de produção roda sem root, com sistema de arquivos somente leitura, sem capabilities do Linux, com limites de memória e de processos, e healthcheck. Variáveis de ambiente (no `docker-compose.yml`):

| Variável | Para quê |
|---|---|
| `SITE_URL` | Endereço público — `https://iconlibrary.io` — usado em `/sitemap.xml` e `/robots.txt`. Sem ela, usa o endereço de cada requisição. |
| `ADSENSE_PUBLISHER_ID` | Seu ID `pub-…`. Liga o `/ads.txt`, exigido pelo AdSense. |

### Publicação

- **HTTPS é obrigatório:** o navegador só permite copiar em páginas seguras. Coloque um proxy reverso com certificado (Nginx, Caddy, Traefik…) na frente da porta 3000.
- **O servidor** (`scripts/server.js`) envia cabeçalhos de segurança, gzip e cabeçalhos de cache (páginas revalidadas a cada visita, demais arquivos guardados por um dia com ETag), aceita só `GET`/`HEAD`, recusa endereços malformados e nunca serve nada fora de `public/`. Ele também gera `/robots.txt`, `/sitemap.xml` e `/ads.txt`.
- **Endereço:** o site é publicado em **https://iconlibrary.io**. As páginas o declaram como endereço canônico e nas tags de prévia em redes sociais (`og:url`, `og:image`); se o domínio mudar, atualize `public/*.html` e `SITE_URL`.
- Outros hosts estáticos (GitHub Pages, Netlify) também servem `public/`, mas sem as rotas geradas e os cabeçalhos acima.

### Publicidade (Google AdSense)

Áreas de anúncio, nunca todas ao mesmo tempo:

- **Laterais:** duas laterais flutuantes de 160×600, à esquerda e à direita, que ficam paradas enquanto a página rola; o conteúdo encolhe para que nada fique encoberto.
- **Faixa:** uma faixa horizontal abaixo do cabeçalho, usada no lugar das laterais quando elas não cabem (janela com menos de 1100 px de largura ou 630 px de altura, como em celulares).
- **Scratchpad:** um bloco de 160×600 dentro da gaveta do scratchpad, ao lado do texto. Só é pedido quando a gaveta abre, e aparece em janelas com pelo menos 640 px de largura e 750 px de altura. Com a gaveta aberta, a lateral direita some.

Elas ficam desligadas até serem configuradas. Para ligar:

1. Em `public/js/models/adsConfig.js`, preencha `cliente` (`ca-pub-…`) e o slot de cada bloco criado no AdSense: três blocos de display fixos de 160×600 (duas laterais e o scratchpad) e um bloco de display responsivo (faixa). Área com slot vazio não aparece.
2. Defina `ADSENSE_PUBLISHER_ID` para o `/ads.txt` ser servido.
3. No painel do AdSense, em *Privacidade e mensagens*, ative a mensagem de consentimento para a Europa (o código não muda).
4. Revise o `public/privacy.html` — ele descreve os cookies do AdSense, mas é um modelo: adapte-o a quem mantém o site.

Com `cliente` vazio nenhum script do Google é carregado; em `localhost` as áreas aparecem como prévias tracejadas.

### Versões dos ícones

Os pacotes ficam fixos em `VERSOES`, no início de `public/js/models/iconSets.js`, para que uma versão nova não quebre a página sozinha. Para atualizar:

1. Troque a versão em `VERSOES` e, para Feather e Bootstrap, a mesma versão em `scripts/generate-icon-categories.js`.
2. Rode `npm run generate` (atualiza as categorias) e `npm test` — um teste falha se os dois arquivos discordarem.
3. Confira a página no navegador.

### Categorias do Feather e do Bootstrap

Nem o Feather nem o Bootstrap Icons publicam categorias; o Lucide publica e, como é um fork do Feather, a maioria dos nomes coincide. O `scripts/generate-icon-categories.js` monta o `public/json/icons-categories.json` tentando, nesta ordem:

| Estratégia | Significado |
|---|---|
| `exact` | O mesmo nome existe no Lucide — herda as categorias dele |
| `tokens` | As mesmas palavras em outra ordem (`alert-circle` ↔ `circle-alert`) |
| `base` | Igual ao anterior, depois de remover um sufixo de variante (`house-fill` → `house`) |
| `approximate` | Regras de palavra-chave do gerador — inferência, não dado oficial |
| `uncategorized` | Nada casou — o ícone vai para `others` |

Cobertura atual:

| Conjunto | Ícones | exact | tokens | base | approximate | uncategorized |
|---|---:|---:|---:|---:|---:|---:|
| Feather | 287 | 220 | 25 | 0 | 27 | 15 |
| Bootstrap | 2078 | 282 | 31 | 265 | 1500 | 0 |

O arquivo gerado é versionado, então a página não depende do gerador. Se ele não puder ser carregado, os ícones do Feather e do Bootstrap são agrupados pela primeira letra.

### Adicionar um conjunto

Os conjuntos ficam em `FONTES`, em `public/js/models/iconSets.js`. Cada entrada tem:

| Campo | Descrição |
|---|---|
| `rotulo` | Nome exibido na lista de conjuntos |
| `rotuloGrupo` | Rótulo do botão de categorias quando nada está selecionado |
| `rotuloGrupoAlternativo` | Rótulo usado quando a fonte de categorias está indisponível (agrupado por letra) |
| `url` | Uma URL ou uma lista; cada item é uma string ou `{ endereco, opcional, resposta: "texto" }` (`opcional`: a falha é tolerada; `resposta: "texto"`: lê como texto) |
| `montar(dados)` | Converte os dados baixados em itens: `{ nome, tipo: "svg" \| "emoji", grupo, svg \| char, versao?, editavel? }` — `editavel: true` mostra o lápis do Lucide Studio (só ícones de traço 24×24) |
| `temTraco`, `temCor` | `true` liga os controles de traço e de cor para o conjunto |
| `detectaGlifo` | `true` para verificar se a fonte do sistema desenha cada item (só emoji) |

### Testes e CI

`npm test` roda os testes de `tests/` com o executor nativo do Node — transformações de SVG, filtros, escape de HTML, scratchpad, versões fixas e o servidor (endereços malformados, fuga de pasta, cabeçalhos, gzip, ETag, rotas geradas). No GitHub, `.github/workflows/ci.yml` roda os testes a cada push e pull request, confere a sintaxe de todos os scripts, faz o build da imagem Docker e espera o healthcheck.

### Estrutura

```
icon-library/
├── public/                             o site
│   ├── index.html                      página principal
│   ├── about.html, privacy.html        guia e política de privacidade
│   ├── css/icon-library.css            estilos (claro e escuro)
│   ├── js/app.js                       ponto de entrada — liga models, views e controllers
│   ├── js/models/                      dados e regras, sem DOM
│   │   ├── iconSets.js                 os conjuntos (FONTES) e as versões fixas
│   │   ├── IconModel.js                carga, cache, filtros, estilo, link do Studio
│   │   ├── svgTools.js                 tamanho/traço/cor, React, nomes de arquivo
│   │   ├── ScratchpadModel.js          texto do scratchpad, guardado no navegador
│   │   ├── adsConfig.js                IDs de editor e de blocos do AdSense
│   │   └── glyphDetector.js            a fonte do sistema desenha este emoji?
│   ├── js/views/                       tudo o que toca o DOM
│   │   ├── IconView.js                 grade, painéis, menu do card, controles de estilo
│   │   ├── ScratchpadView.js           gaveta do scratchpad
│   │   ├── AdsView.js                  áreas de publicidade
│   │   ├── html.js                     escape de HTML
│   │   ├── theme.js                    tema claro/escuro (todas as páginas)
│   │   └── goTop.js                    botão "voltar ao topo"
│   ├── js/controllers/
│   │   ├── IconController.js           ações do usuário → model → view, estado no endereço
│   │   ├── ScratchpadController.js     abrir/fechar, adicionar, copiar, limpar
│   │   ├── clipboard.js                cópia para a área de transferência
│   │   └── download.js                 downloads de SVG e PNG
│   ├── img/iconlibrary.png             logo e favicon
│   └── json/icons-categories.json      categorias geradas (Feather, Bootstrap)
├── scripts/server.js                   servidor (npm start)
├── scripts/generate-icon-categories.js gerador de categorias
├── tests/                              npm test
├── .github/workflows/ci.yml            integração contínua
├── Dockerfile, docker-compose*.yml     container
└── package.json
```

O `public/js/package.json` só marca a pasta como módulos ES, para o Node conseguir importar esses arquivos nos testes.

### Créditos

O Icon Library é criado e mantido por **André M. Ferreira** ([iconlibrary.io](https://iconlibrary.io)).

Os ícones pertencem aos seus autores e são usados sob as respectivas licenças: [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) (ISC), [Feather](https://github.com/feathericons/feather/blob/main/LICENSE) (MIT), [Bootstrap Icons](https://github.com/twbs/icons/blob/main/LICENSE) (MIT) e [unicode-emoji-json](https://github.com/muan/unicode-emoji-json/blob/main/LICENSE) (MIT). A aparência dos emojis depende das fontes instaladas em cada sistema.
