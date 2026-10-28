# Contributing

[English](#english) · [Português](#português)

## English

Thank you for wanting to help! There are many ways to do it, and most of them need no code.

### Ways to help

| You want to… | Go to |
| --- | --- |
| Share an icon you made | Publish it on the site: open it in the editor and use **Publish to Iconlibrary** (a [supporter](https://iconlibrary.io) benefit). After review it joins the community set, under the MIT license. |
| Report a bug | [Open an issue](https://github.com/andremendesferreira/icon-library/issues/new/choose), or use **Report a bug** in the site footer (no GitHub account needed). |
| Suggest an idea or ask a question | [Discussions](https://github.com/andremendesferreira/icon-library/discussions) |
| Report a security problem | Privately — see [SECURITY.md](SECURITY.md). Never in a public issue. |
| Improve a translation | A pull request, or an issue saying which text and language. The translations were made by AI, so native speakers are especially welcome. |
| Change the code | A pull request — read on. |

Follow the news on the [Telegram channel](https://t.me/iconlibraryio).

### Running it locally

Requires **Node.js 20+** (24 is what CI and Docker use).

```bash
git clone https://github.com/andremendesferreira/icon-library.git
cd icon-library
npm ci
npm start      # → http://localhost:8080
npm test
```

Without a database the site works fully, except for the features that need one (coffee, Iconlibrary, bug reports). To try those, see *Running with Docker* and *Database and migrations* in the [README](README.md).

### How the code is organized

- **No framework and no build step.** Plain HTML, CSS and JavaScript (ES modules) in `public/`, organized as MVC: `models/`, `views/`, `controllers/`. Please keep it that way — a new dependency needs a strong reason.
- **The server** is `scripts/server.js`, with one module per feature (`coffee.js`, `iconlibrary.js`, `reports.js`…). A new file in `scripts/` must also be added to the `COPY` line of the `Dockerfile`.
- **8 languages.** Every text shown on the page is a key in `public/js/i18n/<lang>.js`, in all 8 files — `tests/i18n.test.mjs` fails if a key, placeholder or tag is missing in one of them. Write the English text and, if you can't translate, say so in the pull request.
- **Guide, About and Privacy** are generated: edit `pages/<page>/<lang>.html` and run `npm run pages`. A test fails if the generated pages are out of date.
- **Database changes** go in a new numbered file in `migrations/`. Never edit a migration that already ran.

### Pull requests

1. For anything larger than a small fix, open an issue or discussion first, so we can agree on the approach before you spend time on it.
2. Keep each pull request to one change, with tests for new behaviour (`node --test`, in `tests/`).
3. `npm test` must pass. CI also checks the syntax of every script and that the Docker image builds and starts.
4. Commit messages: a short subject in English, in the imperative (*Add…*, *Fix…*), with the why in the body when it is not obvious.
5. By sending a pull request, you agree that your contribution is licensed under the [MIT License](LICENSE).

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Português

Obrigado por querer ajudar! Há muitas formas de fazer isso, e a maioria não precisa de código.

### Formas de ajudar

| Você quer… | Vá para |
| --- | --- |
| Compartilhar um ícone que fez | Publique no site: abra no editor e use **Publicar na Iconlibrary** (benefício de [apoiador](https://iconlibrary.io)). Depois da revisão, ele entra no conjunto da comunidade, sob a licença MIT. |
| Reportar um bug | [Abra uma issue](https://github.com/andremendesferreira/icon-library/issues/new/choose), ou use **Reportar bug** no rodapé do site (sem precisar de conta no GitHub). |
| Sugerir uma ideia ou tirar uma dúvida | [Discussions](https://github.com/andremendesferreira/icon-library/discussions) |
| Reportar um problema de segurança | Em privado — veja o [SECURITY.md](SECURITY.md). Nunca numa issue pública. |
| Melhorar uma tradução | Um pull request, ou uma issue dizendo qual texto e qual idioma. As traduções foram feitas por IA, então falantes nativos são especialmente bem-vindos. |
| Mudar o código | Um pull request — continue lendo. |

Acompanhe as novidades no [canal do Telegram](https://t.me/iconlibraryio).

### Rodando localmente

Precisa do **Node.js 20+** (o CI e o Docker usam o 24).

```bash
git clone https://github.com/andremendesferreira/icon-library.git
cd icon-library
npm ci
npm start      # → http://localhost:8080
npm test
```

Sem banco de dados o site funciona por completo, menos os recursos que precisam dele (café, Iconlibrary, relatos de bug). Para testá-los, veja *Rodando com Docker* e *Banco de dados e migrations* no [README](README.md).

### Como o código está organizado

- **Sem framework e sem build.** HTML, CSS e JavaScript puros (módulos ES) em `public/`, organizados em MVC: `models/`, `views/`, `controllers/`. Por favor, mantenha assim — uma dependência nova precisa de um bom motivo.
- **O servidor** é o `scripts/server.js`, com um módulo por recurso (`coffee.js`, `iconlibrary.js`, `reports.js`…). Um arquivo novo em `scripts/` também precisa entrar na linha `COPY` do `Dockerfile`.
- **8 idiomas.** Todo texto mostrado na página é uma chave em `public/js/i18n/<lang>.js`, nos 8 arquivos — o `tests/i18n.test.mjs` falha se faltar uma chave, um marcador ou uma tag em algum deles. Escreva o texto em inglês e, se não puder traduzir, avise no pull request.
- **Guia, Sobre e Privacidade** são gerados: edite `pages/<página>/<lang>.html` e rode `npm run pages`. Um teste falha se as páginas geradas estiverem desatualizadas.
- **Mudanças no banco** vão num arquivo novo e numerado em `migrations/`. Nunca edite uma migration que já rodou.

### Pull requests

1. Para qualquer coisa maior que uma correção pequena, abra antes uma issue ou discussão, para combinarmos o caminho antes de você investir tempo.
2. Uma mudança por pull request, com testes para o comportamento novo (`node --test`, em `tests/`).
3. O `npm test` precisa passar. O CI também confere a sintaxe de todos os scripts e se a imagem Docker é gerada e sobe.
4. Mensagens de commit: um assunto curto em inglês, no imperativo (*Add…*, *Fix…*), com o porquê no corpo quando não for óbvio.
5. Ao enviar um pull request, você concorda que a sua contribuição fica sob a [licença MIT](LICENSE).

Todos que participam seguem o [Código de Conduta](CODE_OF_CONDUCT.md).
