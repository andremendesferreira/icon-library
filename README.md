<p align="center">
  <img src="public/img/iconlibrary.png" alt="Icon Library" width="160">
</p>

<h1 align="center">Icon Library</h1>

<p align="center">
  <a href="#english">English</a> · <a href="#português">Português</a>
</p>

---

## English

A single page for browsing, filtering and copying icons from four sets — **Emoji (Unicode)**, **Lucide**, **Feather** and **Bootstrap Icons** — to use in menus and interfaces. Click an icon to copy it; right-click to copy the alternative.

No framework, no build step, no dependencies: plain HTML, CSS and JavaScript.

### Features

- **Four icon sets** in one place, loaded on demand — nothing is downloaded until you pick a set, and each set is cached after the first load.
- **Categories** with multi-select, for every set (see [how Feather and Bootstrap get categories](#categories-for-feather-and-bootstrap)).
- **Search** by icon name.
- **Emoji glyph detection:** emojis your system font cannot draw are flagged with their Unicode version, and can be hidden with *Only those with a design on this machine*.
- **Keyboard support:** arrow keys move through the set list, `Esc` closes any open panel.
- **Responsive** from 360 px phones to wide desktops.

### Icon sets

| Set | Source | Categories | License |
|---|---|---|---|
| Emoji (Unicode) | [unicode-emoji-json](https://github.com/muan/unicode-emoji-json) | Official Unicode groups | MIT |
| Lucide | [lucide-static](https://lucide.dev) | Official, from the Lucide API | ISC |
| Feather | [feather-icons](https://feathericons.com) | Generated — `json/icons-categories.json` | MIT |
| Bootstrap Icons | [bootstrap-icons](https://icons.getbootstrap.com) | Generated — `json/icons-categories.json` | MIT |

Icon data is fetched at runtime from [unpkg](https://unpkg.com) (and the Lucide categories from `lucide.dev`), so the page needs internet access.

### Getting started

Requires **Node.js 18+** — only for the local server and the category generator; the page itself is static.

```bash
npm start
# → http://localhost:8080   (another port: PORT=3000 npm start)
```

Any static server works as well, e.g. `python -m http.server 8080`.

> **Why not just open `index.html`?** Opened from disk (`file://`), the browser blocks loading `json/icons-categories.json`, and the Clipboard API only works in a secure context (`https://` or `localhost`). Always serve the folder over HTTP.

### How to use

1. Pick a set in **Select**.
2. Optionally narrow it down with **All categories** (several can be selected) and the **search** field.
3. Click or right-click an icon:

| Set | Click | Right-click |
|---|---|---|
| Emoji | Copies the emoji character | Copies it wrapped in an SVG (`<text>`) — still depends on the font to render |
| Lucide, Feather, Bootstrap | Copies the SVG markup, ready to paste; it inherits the text color (`currentColor`) | Copies the icon name |

### Deploying

The project is a static site with relative paths, so it can be published as is — GitHub Pages, Netlify, any web server — including under a sub-path (e.g. `https://user.github.io/icon-library/`). Serve it over **HTTPS** so copying works.

### Advertising (Google AdSense)

The page has three ad areas, never all at once: two floating 160×600 side rails, left and right, that stay in place while the page scrolls (the content narrows to make room, so nothing is covered); and a horizontal banner below the header, used instead when the rails do not fit (window narrower than 1100 px or shorter than 630 px, e.g. phones).

They stay off until configured. To turn them on:

1. In `public/js/models/adsConfig.js`, fill in `cliente` (your `ca-pub-…` publisher ID) and the slot ID of each ad unit created in AdSense — two fixed 160×600 display units for the rails and one responsive display unit for the banner. An area with an empty slot is not shown.
2. Create `public/ads.txt` with the line AdSense gives you (`google.com, pub-…, DIRECT, f08c47fec0942fa0`).

With `cliente` empty no Google script is loaded; on `localhost` the areas show as dashed previews so the layout can be checked.

### Categories for Feather and Bootstrap

Neither Feather nor Bootstrap Icons publish categories; Lucide does, and since Lucide is a fork of Feather most names match. `scripts/generate-icon-categories.js` builds `json/icons-categories.json` by trying, in order:

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

The generated file is committed, so the page does not depend on the generator. To refresh it after new icon releases (needs internet):

```bash
npm run generate
```

If the categories file cannot be loaded, the page still works and groups Feather/Bootstrap icons by first letter instead.

### Adding an icon set

Sets are declared in the `FONTES` object in `public/js/models/iconSets.js`. Each entry has:

| Field | Description |
|---|---|
| `rotulo` | Name shown in the set list |
| `rotuloGrupo` | Label of the category button when nothing is selected |
| `rotuloGrupoAlternativo` | Label used when the categories source is unavailable (grouped by letter) |
| `url` | One URL, or a list; each item is a string or `{ endereco, opcional, resposta: "texto" }` (`opcional`: failure is tolerated; `resposta: "texto"`: read as text instead of JSON) |
| `montar(data)` | Turns the downloaded data into items: `{ nome, tipo: "svg" \| "emoji", grupo, svg \| char, versao? }` |
| `detectaGlifo` | `true` to check whether the system font can draw each item (emoji only) |

### Project structure

```
icon-library/
├── public/                             the static site
│   ├── index.html                      page
│   ├── css/icon-library.css            styles
│   ├── js/app.js                       entry point — wires model, view, controller
│   ├── js/models/                      data and state, no DOM
│   │   ├── iconSets.js                 the icon sets (FONTES)
│   │   ├── adsConfig.js                AdSense publisher and slot IDs
│   │   ├── IconModel.js                loading, cache, filters, grouping
│   │   └── glyphDetector.js            can the system font draw this emoji?
│   ├── js/views/                       everything that touches the DOM
│   │   ├── IconView.js                 grid, panels, summary, toast
│   │   ├── AdsView.js                  ad areas
│   │   └── goTop.js                    "back to top" button
│   ├── js/controllers/
│   │   └── IconController.js           user actions → model → view
│   ├── img/iconlibrary.png             logo and favicon
│   └── json/icons-categories.json      generated categories (Feather, Bootstrap)
├── scripts/generate-icon-categories.js category generator
├── scripts/server.js                   local server (npm start)
├── Dockerfile, docker-compose.yml      container (docker compose up --build)
└── package.json
```

### Credits

Icons belong to their authors and are used under their licenses: [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) (ISC), [Feather](https://github.com/feathericons/feather/blob/main/LICENSE) (MIT), [Bootstrap Icons](https://github.com/twbs/icons/blob/main/LICENSE) (MIT) and [unicode-emoji-json](https://github.com/muan/unicode-emoji-json/blob/main/LICENSE) (MIT). Emoji rendering depends on the fonts installed on each system.

---

## Português

Uma página para navegar, filtrar e copiar ícones de quatro conjuntos — **Emoji (Unicode)**, **Lucide**, **Feather** e **Bootstrap Icons** — para usar em menus e interfaces. Clique num ícone para copiá-lo; clique com o botão direito para copiar a alternativa.

Sem framework, sem build, sem dependências: HTML, CSS e JavaScript puros.

### Recursos

- **Quatro conjuntos** num só lugar, carregados sob demanda — nada é baixado até você escolher um conjunto, e cada um fica em cache depois da primeira carga.
- **Categorias** com seleção múltipla, em todos os conjuntos (veja [como o Feather e o Bootstrap recebem categorias](#categorias-do-feather-e-do-bootstrap)).
- **Busca** pelo nome do ícone.
- **Detecção de glifo nos emojis:** emojis que a fonte do sistema não consegue desenhar são sinalizados com a versão Unicode e podem ser ocultados com *Only those with a design on this machine*.
- **Teclado:** as setas percorrem a lista de conjuntos e `Esc` fecha qualquer painel aberto.
- **Responsiva** de celulares de 360 px a monitores largos.

### Conjuntos de ícones

| Conjunto | Origem | Categorias | Licença |
|---|---|---|---|
| Emoji (Unicode) | [unicode-emoji-json](https://github.com/muan/unicode-emoji-json) | Grupos oficiais do Unicode | MIT |
| Lucide | [lucide-static](https://lucide.dev) | Oficiais, pela API do Lucide | ISC |
| Feather | [feather-icons](https://feathericons.com) | Geradas — `json/icons-categories.json` | MIT |
| Bootstrap Icons | [bootstrap-icons](https://icons.getbootstrap.com) | Geradas — `json/icons-categories.json` | MIT |

Os dados dos ícones são baixados em tempo de execução pelo [unpkg](https://unpkg.com) (e as categorias do Lucide pelo `lucide.dev`), então a página precisa de internet.

### Como rodar

Requer **Node.js 18+** — só para o servidor local e o gerador de categorias; a página em si é estática.

```bash
npm start
# → http://localhost:8080   (outra porta: PORT=3000 npm start)
```

Qualquer servidor estático também serve, por exemplo `python -m http.server 8080`.

> **Por que não abrir o `index.html` direto?** Aberto do disco (`file://`), o navegador bloqueia o carregamento do `json/icons-categories.json`, e a API de área de transferência só funciona em contexto seguro (`https://` ou `localhost`). Sirva sempre a pasta por HTTP.

### Como usar

1. Escolha um conjunto em **Select**.
2. Se quiser, refine com **All categories** (dá para marcar várias) e com o campo de **busca**.
3. Clique ou clique com o botão direito num ícone:

| Conjunto | Clique | Botão direito |
|---|---|---|
| Emoji | Copia o caractere do emoji | Copia o emoji dentro de um SVG (`<text>`) — ainda depende da fonte para aparecer |
| Lucide, Feather, Bootstrap | Copia o SVG pronto para colar; ele herda a cor do texto (`currentColor`) | Copia o nome do ícone |

### Publicação

O projeto é um site estático com caminhos relativos, então pode ser publicado como está — GitHub Pages, Netlify, qualquer servidor web — inclusive num subcaminho (ex.: `https://usuario.github.io/icon-library/`). Publique com **HTTPS** para a cópia funcionar.

### Publicidade (Google AdSense)

A página tem três áreas de anúncio, nunca todas ao mesmo tempo: duas laterais flutuantes de 160×600, à esquerda e à direita, que ficam paradas enquanto a página rola (o conteúdo encolhe para dar lugar, então nada fica encoberto); e uma faixa horizontal abaixo do cabeçalho, usada no lugar delas quando não cabem (janela com menos de 1100 px de largura ou 630 px de altura, como em celulares).

Elas ficam desligadas até serem configuradas. Para ligar:

1. Em `public/js/models/adsConfig.js`, preencha `cliente` (seu ID de editor `ca-pub-…`) e o ID de cada bloco criado no AdSense — dois blocos de display fixos de 160×600 para as laterais e um bloco de display responsivo para a faixa. Área com slot vazio não aparece.
2. Crie `public/ads.txt` com a linha fornecida pelo AdSense (`google.com, pub-…, DIRECT, f08c47fec0942fa0`).

Com `cliente` vazio nenhum script do Google é carregado; em `localhost` as áreas aparecem como prévias tracejadas, para conferir o layout.

### Categorias do Feather e do Bootstrap

Nem o Feather nem o Bootstrap Icons publicam categorias; o Lucide publica e, como é um fork do Feather, a maioria dos nomes coincide. O `scripts/generate-icon-categories.js` monta o `json/icons-categories.json` tentando, nesta ordem:

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

O arquivo gerado é versionado, então a página não depende do gerador. Para atualizá-lo quando saírem ícones novos (precisa de internet):

```bash
npm run generate
```

Se o arquivo de categorias não puder ser carregado, a página continua funcionando e agrupa os ícones do Feather e do Bootstrap pela primeira letra.

### Adicionar um conjunto

Os conjuntos ficam no objeto `FONTES`, em `public/js/models/iconSets.js`. Cada entrada tem:

| Campo | Descrição |
|---|---|
| `rotulo` | Nome exibido na lista de conjuntos |
| `rotuloGrupo` | Rótulo do botão de categorias quando nada está selecionado |
| `rotuloGrupoAlternativo` | Rótulo usado quando a fonte de categorias está indisponível (agrupado por letra) |
| `url` | Uma URL ou uma lista; cada item é uma string ou `{ endereco, opcional, resposta: "texto" }` (`opcional`: a falha é tolerada; `resposta: "texto"`: lê como texto em vez de JSON) |
| `montar(dados)` | Converte os dados baixados em itens: `{ nome, tipo: "svg" \| "emoji", grupo, svg \| char, versao? }` |
| `detectaGlifo` | `true` para verificar se a fonte do sistema desenha cada item (só emoji) |

### Estrutura

```
icon-library/
├── public/                             o site estático
│   ├── index.html                      página
│   ├── css/icon-library.css            estilos
│   ├── js/app.js                       ponto de entrada — liga model, view e controller
│   ├── js/models/                      dados e estado, sem DOM
│   │   ├── iconSets.js                 os conjuntos de ícones (FONTES)
│   │   ├── adsConfig.js                IDs de editor e de blocos do AdSense
│   │   ├── IconModel.js                carga, cache, filtros, agrupamento
│   │   └── glyphDetector.js            a fonte do sistema desenha este emoji?
│   ├── js/views/                       tudo o que toca o DOM
│   │   ├── IconView.js                 grade, painéis, resumo, aviso
│   │   ├── AdsView.js                  áreas de publicidade
│   │   └── goTop.js                    botão "voltar ao topo"
│   ├── js/controllers/
│   │   └── IconController.js           ações do usuário → model → view
│   ├── img/iconlibrary.png             logo e favicon
│   └── json/icons-categories.json      categorias geradas (Feather, Bootstrap)
├── scripts/generate-icon-categories.js gerador de categorias
├── scripts/server.js                   servidor local (npm start)
├── Dockerfile, docker-compose.yml      container (docker compose up --build)
└── package.json
```

### Créditos

Os ícones pertencem aos seus autores e são usados sob as respectivas licenças: [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) (ISC), [Feather](https://github.com/feathericons/feather/blob/main/LICENSE) (MIT), [Bootstrap Icons](https://github.com/twbs/icons/blob/main/LICENSE) (MIT) e [unicode-emoji-json](https://github.com/muan/unicode-emoji-json/blob/main/LICENSE) (MIT). A aparência dos emojis depende das fontes instaladas em cada sistema.
