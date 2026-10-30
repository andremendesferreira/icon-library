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
- **Generated pages:** `public/{about,guide,privacy}*.html` come from `pages/`. Edit `pages/` and run `npm run pages`.
- **Dockerfile:** it lists the scripts one by one, so a new file in `scripts/` needs its own `COPY`.
- **Migrations:** applied by hand with the database owner role (`PG_MIGRATE=false`). The app uses another role, so a new table needs its `GRANT`, and the migration must be recorded in `schema_migrations`.

## SVG editor

- `svgGeometry.js` has pure geometry and `EditorModel.js` holds the state, neither touching the DOM (except `lerSvg`). `EditorView.js` draws and reads input; `EditorController.js` connects them.
- **Selection:** `selecionado` (one shape), `selecionado` + `extras` (several) or `grupoSelecionado` (a whole group). Use `definirSelecao` and `alvos()`; a complete group turns into a group selection.
- **Groups:** `grupos[0]` is the opened icon, with loose shapes. Every other entry is a group, either an icon added on top or `manual: true` from *Group*. A click selects the group; a double click picks one shape. Groups exist only in the editor and in `.ile` files, and the exported SVG stays flat, with no `<g>`.
- **Canvas nodes are recreated on every draw**, so `dblclick` never arrives: the double click is counted in `pointerdown`.
- **Esc** goes in order: cancel the split mode, clear the selection, then ask to close the editor.
- **Editor buttons with an icon only** need `title` and `aria-label` through `data-i18n-attr`. `data-i18n` on a button would replace its icon. Combine buttons get their text from `mostrarCombinar`, which explains what is missing when they are disabled.
