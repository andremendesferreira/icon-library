# Icon Library

Site at https://iconlibrary.io. Plain ES modules with an MVC layout, no framework and no build step for the front end. See `README.md` for the full description and `CONTRIBUTING.md` for how the code is organized.

## Working rules

- Reply in Portuguese (pt-BR), the maintainer's language. Code comments are in Portuguese; commit messages in English.
- Commit only when asked. The maintainer runs `git push` and updates the Portainer stack.
- Secrets live only in `stack.env`, which is gitignored. Never paste or print tokens, keys or supporter codes.
- **At the end of every change, update everything it touches before reporting it as done:**
  - `README.md`, in English and Portuguese;
  - the Guide in `pages/guide/*.html`, in all 8 languages, then `npm run pages`;
  - the editor help (`#editor-help` in `public/index.html`) when a command or shortcut changes;
  - `public/llms.txt` when the editor or the `.ile` format changes;
  - `docs/img/*` when the interface in a screenshot changes;
  - this file, when a rule or an architecture note changes.

## Before calling a change ready

- `npm test` (Node's built-in runner, in `tests/`).
- Interface changes: open the real page in a browser, in light and dark themes and at phone width (360 px upward).
- Server changes: build and run the Docker image and wait for its healthcheck.

## Rules that are easy to miss

- **8 languages:** `en`, `es`, `fr`, `de`, `ru`, `zh-CN`, `pt-BR`, `ja`. Every key in `public/js/i18n/` must exist in all of them (`tests/i18n.test.mjs` enforces it).
- **Generated pages:** `public/{about,guide,privacy}*.html` the set guides (`lucide-icons`, `feather-icons`, `bootstrap-icons`, `emoji-icons`) and the articles (`ARTIGOS` in `scripts/build-pages.mjs`, also listed in the sitemap regex in `scripts/server.js`) come from `pages/`. Edit `pages/` and run `npm run pages`.
- **Set guides and articles are an exception to the 8 languages:** only English and Portuguese for now, the languages the maintainer can review. `data-languages` tells `detect.js` which versions exist. Their text is written by hand: don't generate thin pages from a template, which is what AdSense rejected.
- **Icon versions and tags:** the pinned versions in `public/js/models/iconSets.js` must match `scripts/generate-icon-categories.js` and `scripts/generate-icon-tags.js`; after a version change, run `npm run tags` to rebuild `public/json/icons-tags.json` (Feather and Bootstrap keywords). Tag sources are `extra: true`: if they fail, search falls back to names and the categories stay.
- **Default set:** with no `?set=`, the page opens the last set chosen (`icon-library:set`) or Lucide, without writing `?set=` to the address, so the home stays `/` for search engines.
- **Dockerfile:** it lists the scripts one by one, so a new file in `scripts/` needs its own `COPY`.
- **IndexNow:** with `INDEXNOW_KEY` and `SITE_URL`, the server sends every sitemap address to IndexNow a minute after each start (`scripts/indexnow.js`). A new page only needs to be in the sitemap; the next deploy announces it to Bing.
- **Migrations:** applied by hand with the database owner role (`PG_MIGRATE=false`). The app uses another role, so a new table needs its `GRANT`, and the migration must be recorded in `schema_migrations`. At start-up the server compares `migrations/` with `schema_migrations` and checks each feature's tables and privileges (`FEATURE_TABLES` in `scripts/db.js`; add a new table there): anything missing turns the database features off and `/api/health`, the Docker healthcheck, answers 503.

## Coffee

Everything that leads to the coffee uses the same gold style (`.coffee-button`, `.site-footer__coffee`), in both themes. People who already support the site see the discreet green instead. Other pages link with `#coffee`, and `<!--cafe-->` in `pages/` becomes the button. Don't put a coffee link inside or next to an ad unit: it could be read as part of the ad, and AdSense restricts text around ads. AdSense turned the site down for low-value content on 2026-11-01, so no text may promise ad removal as if ads were already showing. A promotion (`COFFEE_PROMO`, `COFFEE_PRICE_REGULAR`, `COFFEE_PROMO_UNTIL`) adds a black badge to the header button and a strip in the coffee window, ending on its own after the last day; the price charged is always the Payment Link's, and supporters don't see the badge. Pages don't state a price, so a promotion never leaves them out of date.

## Text contrast

Text must reach 4.5:1 (WCAG AA) in both themes. Secondary text uses `var(--il-muted)` and blue text `var(--il-blue-dark)`; both have a dark-theme value, so never hardcode a gray for text. White text on blue sits on `var(--il-action)` / `--il-action-hover`, which stay the same in both themes. `tests/contrast.test.mjs` blocks the old low-contrast colors.

## Microsoft Clarity

`public/js/views/clarity.js` loads in both heads (`public/index.html` and `scripts/build-pages.mjs`), never on localhost or in `/admin`. Any new field or area that shows a supporter code, a form the visitor fills or SVG code needs `data-clarity-mask="true"` (`tests/clarity.test.mjs`). No consent signal is sent, so Clarity runs cookieless in the EEA, UK and Switzerland; the privacy policy says so in all 8 languages.

## Footer

Links use the same color and SVG icons (`.site-footer__icon`, Bootstrap Icons), in `public/index.html` and `scripts/build-pages.mjs`; only the coffee keeps its button style. `.site-footer__quebra` splits the pages and coffee from the community links.

## SVG editor

- `svgGeometry.js` has pure geometry and `EditorModel.js` holds the state, neither touching the DOM (except `lerSvg`). `EditorView.js` draws and reads input; `EditorController.js` connects them.
- **Selection:** `selecionado` (one shape), `selecionado` + `extras` (several) or `grupoSelecionado` (a whole group). Use `definirSelecao` and `alvos()`; a complete group turns into a group selection.
- **Groups:** `grupos[0]` is the opened icon, with loose shapes. Every other entry is a group, either an icon added on top or `manual: true` from *Group*. A click selects the group; a double click picks one shape. Groups exist only in the editor and in `.ile` files, and the exported SVG stays flat, with no `<g>`.
- **Canvas nodes are recreated on every draw**, so `dblclick` never arrives: the double click is counted in `pointerdown`.
- **Phone layout (up to 900 px wide):** the drawing stays in view, with the tools in tabs below it. `data-painel` blocks use `display: contents` on larger screens, and `data-aba` on `#editor-layout` picks the visible one. A new tool needs its place in a panel, and a keyboard-only action needs a touch path too (`.editor__barra`). Publish and Copy SVG stay in a fixed footer on every tab; the rest of the footer shows only in the Export tab.
- **Touch (`pointer: coarse`, `EditorView.toque`):** larger targets; a touch on a shape only acts when the finger lifts, moves or holds for 500 ms (long press adds or removes it), because selecting on `pointerdown` would clear the selection first. Moving a shape requires it to be selected already. Hints use the `…Touch` keys, and the help shows `.editor-help__toque` rows instead of `.editor-help__teclado`.
- **Esc** goes in order: cancel the split mode, clear the selection, then ask to close the editor.
- **Editor buttons with an icon only** need `title` and `aria-label` through `data-i18n-attr`. `data-i18n` on a button would replace its icon. Combine buttons get their text from `mostrarCombinar`. They use `aria-disabled`, not `disabled`, so a tap on one can explain what is missing, because a phone has no hover.
- **Join** has two modes in `EditorModel.unir`: two selected lines, or one open line (`uniaoDaForma`), which closes it or connects its nearest end to the selected point.
- **Fill** (`alternarPreenchimento`) only works on closed shapes (`formaFechada`). Removing the fill of a shape with no stroke gives it a stroke, so it doesn't vanish.
- **SVG from outside** (pasted code, `#svg=`/`#ile=` links, `.ile` files) goes through `lerSvg`, which keeps only the elements in `ELEMENTOS_SVG`, drops comments and `<?…?>` and keeps only `href="#…"`. Insert editor SVG into the page with `svgDoTexto` (XML parser), never `innerHTML`: the HTML parser reads comments and `<?…?>` differently, which was an XSS.
- **Zoom** lives only in the view (`EditorView.zoom`, `centroVista`): the canvas `viewBox` is the icon plus margin divided by the zoom, and `this.escala` (screen pixels per unit) sizes points, handles and the snapping tolerance. Never store zoom in the model or in `.ile`.
- **Selection handles** scale uniformly only: `transformarElemento` assumes similarity transforms (circles, arcs and rounded corners use one scale), so a non-uniform matrix would break them. Handles, X/Y/W/H and the pen all go through the model (`arrastarEscala`, `arrastarGiro`, `definirCaixa`, `adicionarPath`).
- **Snapping** to other shapes happens in `arrastarPonto`/`arrastarElemento` with a tolerance in icon units from the view (Alt passes 0); the targets are computed once per drag (`alvosDeEncaixe`) and the guide lines are `model.guias`.
- **Draft:** `EditorController` keeps the edit in progress in `localStorage` (`icon-library:editor-draft`, listed in the privacy policy) and offers it back when the editor opens; closing the editor deletes it. **Toasts with Undo** (`avisarDesfazivel`) only undo if nothing else changed since.
- **Tab** on the canvas picks the next shape but lets focus leave after the last one (no keyboard trap).
- **Show layers** only changes how the canvas and the list are drawn (`EditorView.camadas`). The SVG never gets those colors. A group is one block with one color (`blocosDasCamadas`).
