# Avaliações dos apoiadores

Apoiadores dão uma nota de 1 a 5 estrelas e um comentário sobre o Icon Library.
Tudo passa por moderação antes de aparecer na seção "O que dizem os apoiadores"
da página Sobre (8 idiomas).

| Parte | Onde |
|---|---|
| Regras, banco e moderação | `scripts/reviews.js` (tabela `reviews`, `migrations/006_reviews.sql`) |
| Logins GitHub, Google, Microsoft | `scripts/oauth.js` |
| Rotas | `handleReviews` e `handleModeration` em `scripts/server.js` |
| Seção e formulário | `<!--avaliacoes-->` em `pages/about/*.html` → `avaliacoes()` em `scripts/build-pages.mjs` |
| Comportamento na página | `public/js/views/reviews.js` |
| Textos | chaves `reviews.*` em `public/js/i18n/` |
| Moderação | aba Avaliações em `scripts/admin.html`; Telegram por `docs/n8n-moderacao-avaliacoes.json` |
| Testes | `tests/reviews.test.mjs` |

## Quem pode avaliar

- Só quem tem um **código de apoiador válido e não vencido**. O código é
  conferido no servidor e nunca aparece em público nem na fila do n8n.
- **Uma avaliação por código.** Mandar de novo substitui a anterior. Se ela já
  estava aprovada, a nova espera em `pending_json` e a aprovada continua no ar
  até a decisão (recusar a edição mantém a aprovada).
- 15 pedidos a cada 15 minutos por IP (envio e "minha avaliação" juntos); um
  campo escondido barra robôs; no máximo 300 esperando revisão.
- Nome e comentário são medidos por caractere (como o `char_length` do banco;
  um emoji conta 1), e os controles bidirecionais (U+202A–202E e afins) saem.
- O `/admin` e o n8n mandam a versão que mostraram (`submittedAt`); aprovar,
  recusar e excluir só valem para essa versão, conferida no mesmo comando SQL.
  Uma edição chegada no meio responde `409 changed`.
- Erros do Postgres vão para o log sem o `detail` (que traria a linha inteira,
  com o código de apoiador).

## Como a pessoa aparece

- **Nome** digitado (1 a 40 caracteres; padrão "Apoiador" no idioma da página)
  e **foto opcional**. Sem foto, a página mostra as iniciais.
- **Foto:** a página recorta no meio, em quadrado, num canvas (aceita PNG, JPEG
  e WebP) e manda um JPEG. O servidor só aceita PNG ou JPEG e sempre redesenha
  como PNG 96×96 com o `@resvg/resvg-js` (`avatarPng`), depois de ler as
  dimensões no cabeçalho e recusar acima de 1024 px (2048 nas fotos do
  provedor): um arquivo pequeno pode declarar 16000×16000 e o decodificador
  pediria gigabytes. Somem os metadados
  (inclusive a localização de fotos de celular) e a página nunca carrega imagem
  de outro site. O resvg não lê WebP, por isso a conversão no navegador.
- **Login opcional** com GitHub (sem escopos), Google (`openid profile`) ou
  Microsoft (`openid profile User.Read`):
  - código de autorização com PKCE e `state` de uso único (10 minutos);
  - o servidor lê nome, id e foto, descarta o token na hora e guarda só
    `sha256(provedor:id)`: é o selo "Verificado via GitHub/Google/Microsoft";
  - a foto só é baixada dos domínios do próprio provedor;
  - o login fica preso ao navegador: o começo grava um valor aleatório no
    cookie `il_review_login` (`HttpOnly`, `SameSite=Lax`, só em
    `/api/reviews`, 30 minutos), conferido na volta, na leitura do ticket e no
    envio. Um ticket visto por outra pessoa não serve, e ninguém consegue
    plantar o próprio login no navegador de outro;
  - a volta cai em `about[.idioma].html#review-ticket=…` (fragmento: o
    navegador não o envia a ninguém), e a página tira o ticket do endereço
    antes de qualquer outra coisa. O ticket vale 30 minutos e é usado uma vez
    no envio;
  - antes de sair para o login, o formulário guarda o que foi escrito no
    `sessionStorage` (`icon-library:review-draft`) e apaga ao voltar.
- O nome digitado vale mais que o do provedor. "Não usar o login" volta a
  anônimo. A pessoa marca a autorização para publicar (LGPD).

## API

| Rota | Para quê |
|---|---|
| `GET /api/reviews/config` | `{ enabled, providers, minComment, maxComment, maxName }` |
| `GET /api/reviews` | aprovadas, da mais recente: nota, comentário, nome, provedor, foto, data; média e total (cache de 60 s) |
| `POST /api/reviews` | `{ code, rating, comment, name, consent, lang, photo?, ticket?, provider? }`; `photo`: `"keep"`, `null` ou data URL |
| `POST /api/reviews/mine` | `{ code }` → a avaliação da pessoa, para editar |
| `GET /api/reviews/:id/avatar.png` | foto de uma aprovada (cache de 5 minutos, para uma foto tirada do ar sumir logo) |
| `GET /api/reviews/auth/:provedor`, `…/callback` | login |
| `POST /api/reviews/identity` | `{ ticket }` → nome e foto para o formulário |
| `/api/admin/reviews…` | `/admin`: lista por situação, foto do que espera, aprovar, recusar, excluir |
| `/api/moderation/reviews…` | n8n: só o que espera; `submittedAt` evita decidir uma versão que ninguém viu |

## Critério de moderação

Recusar só spam, ofensas, links, propaganda, dados pessoais de terceiros e
fotos impróprias. **Nunca recusar pela nota:** esconder as negativas tornaria a
média enganosa (a regra da FTC de 2024 sobre avaliações proíbe isso, e o
Google trata como conteúdo enganoso). A seção diz isso ao visitante
(`reviews.policy`), nos 8 idiomas, e o `/admin` lembra a regra.

A lista mostra primeiro as avaliações no idioma da página, e cada item leva
`lang` com o idioma em que foi escrito.

## Dados estruturados

Nenhum `AggregateRating`: o Google não aceita avaliações de um site sobre si
mesmo e pode penalizar. As estrelas ficam só na página.

## Para ligar em produção

1. Aplicar `migrations/006_reviews.sql` com o papel dono e registrar em
   `schema_migrations` (o arquivo já dá o `GRANT` ao `iconlibrary_api`, se ele
   existir).
2. Opcional, para os logins: criar os apps OAuth e pôr no `stack.env`. Um
   provedor sem as duas variáveis simplesmente não aparece.

| Provedor | Onde criar | Endereço de retorno |
|---|---|---|
| GitHub | github.com → Settings → Developer settings → OAuth Apps | `https://iconlibrary.io/api/reviews/auth/github/callback` |
| Google | console.cloud.google.com → APIs e serviços → Credenciais (tela de consentimento "Externo", escopos `openid profile`) | `…/auth/google/callback` |
| Microsoft | entra.microsoft.com → Registros de aplicativo (contas pessoais e corporativas, permissão `User.Read`) | `…/auth/microsoft/callback` |

Variáveis: `GITHUB_OAUTH_ID`, `GITHUB_OAUTH_SECRET`, `GOOGLE_OAUTH_ID`,
`GOOGLE_OAUTH_SECRET`, `MICROSOFT_OAUTH_ID`, `MICROSOFT_OAUTH_SECRET`.

3. Importar `docs/n8n-moderacao-avaliacoes.json` e reimportar
   `docs/n8n-moderacao-telegram-botoes.json` (veja `docs/moderacao-n8n.md`).

## Fora do escopo agora

Responder avaliações, curtir avaliações de outros, ordenar por nota e mostrar
avaliações na home (ela continua focada na busca).
