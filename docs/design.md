# Design do Icon Library

Interface minimalista e arrojada: o conteúdo (os ícones) é o que tem cor, com
profundidade (sombras em camadas, 3D leve) e movimento curto. A marca aparece
no logo e em poucos pontos de ação. Estas regras valem para todas as páginas;
as camadas "Design minimalista" e "Arrojado (2026-11)" no fim de
`public/css/icon-library.css` as aplicam.

## Marca

- **Logo:** o livro colorido (`img/logo-180.webp`), **sozinho**, sem o nome
  escrito (o nome fica em `aria-label`, `title` e texto só para leitor de
  tela): 48 px no cabeçalho (40 px no celular), com volume (sombra de contato,
  brilho que passa, inclinação 3D no hover). Com a busca presa no topo, o logo
  aparece também à esquerda dela (`.marca-presa`, a partir de 1000 px), e o
  clique volta ao topo sem limpar a busca.
- **Azul da marca** (`--il-action` #1a6ee8, `--il-blue-dark` para texto):
  só para ações (botão principal, link, foco, item marcado).
- **Dourado** (`--il-gold`): só o café. Verde (#1e8449): só o "deu certo".
- **Âmbar** (`--il-warn`): estrelas das avaliações (página Sobre) e avisos.
- **Degradê** só no que a pessoa desenha no editor (as oito sugestões de
  `models/degrade.js`) e numa exceção da interface: o par do título da home,
  a lupa azul (`img/lupa-titulo.svg`) e o check verde (`img/check-titulo.svg`),
  desenhos de fundo atrás das letras com opacidade 0,15 (lupa) e 0,2
  (check, que perde a forma mais cedo). Nada de fundo de
  interface em degradê.
- **Cores do logo** (azul, laranja-amarelado, turquesa, roxo, verde): só nos
  ícones decorativos que flutuam no herói.
- O resto é neutro: fundo `--cor-fundo`, superfícies `--cor-superficie`,
  bordas `--cor-borda`, texto `--cor-texto` e `--il-muted` (secundário).
- Nada de gradiente em texto. Sombras em camadas (`--sombra-1` em repouso,
  `--sombra-2` em destaque) na busca, nos passos, nos cards ao passar o mouse
  e em menus que flutuam.
- **Vidro fosco** nas barras presas ao rolar: a busca da home, os títulos de
  categoria e o cabeçalho fixo das páginas de texto (`backdrop-filter`, fundo
  sólido onde não houver suporte).

## Tipografia

| Uso | Tamanho | Variável |
|---|---|---|
| Texto de leitura, controles, menus, avisos | **18 px** (mínimo) | `--fs-texto` |
| Destaque, subtítulo, título de passo, h3 | 20 px | `--fs-mais` |
| h2 das páginas | 24 px | `--fs-h2` |
| Título principal (home) | 38–72 px, peso 800 | `.heroi__titulo` |
| Título das páginas de texto | 30–44 px | `--fs-titulo` |
| Editor (painéis estreitos) | 16 px no mínimo | `--fs-editor` |

- Fonte do sistema (`--fonte`), entrelinha 1,6 (1,7 nas páginas de texto).
- Contadores em selo (categorias) podem ter 16 px; nada abaixo disso.
- Os 18 px valem em todo lugar fora do editor: janelas (café, publicar, PNG,
  Meus ícones, reportar), scratchpad, rodapé, `kbd`, `code`, blocos `pre`,
  tabelas, sumário e o rótulo do anúncio. No editor, exatamente 16 px: com
  18, o rodapé de botões não cabe numa linha.
- O nome do ícone no card não fica escrito o tempo todo: aparece ao passar o
  mouse ou focar, com 18 px, e continua no `aria-label` dos botões.

## Espaço e forma

- Múltiplos de 4 px; cantos de 12 px (`--raio`) em cartões, 999 px em
  pílulas (busca, botões de controle).
- Largura de leitura até ~760 px; busca até 860 px; grade de passos e
  ferramentas até 980 px.

## Orientação

- A home começa pela **busca**: grande, no centro, com o cursor já nela
  (só com mouse; no celular não, para não abrir o teclado).
- Logo abaixo, **três passos ilustrados** (Busque, Clique para copiar, Edite
  no lápis), cada um com uma frase curta, e o link para o Guia completo.
- Ilustrações: SVG em linha, só traço neutro e um toque do azul, que se
  adaptam aos dois temas pelas variáveis `--ilus-*`. Mostram a ação, não
  decoram.
- Textos de orientação: uma frase por ideia, verbo no imperativo, sem jargão.
  Detalhes ficam no Guia.

## Acessibilidade

- Contraste mínimo 4,5:1 nos dois temas (`tests/contrast.test.mjs`);
  controles desativados são a exceção da WCAG.
- Borda que identifica um controle (a busca, os campos): 3:1 ou mais contra o
  que está em volta, nos dois temas (`--cor-borda-forte`, `#86919f` no claro e
  `#5e6d84` no escuro), também em todo campo de digitação (janelas,
  scratchpad, busca das páginas, editor). Bordas só decorativas usam
  `--cor-borda`; botões com texto ou ícone se identificam pelo rótulo.
- Foco sempre visível: contorno de 3 px no azul da marca.
- Alvos de toque de 44 px ou mais no celular.
- Todo botão só com ícone tem `aria-label` (e `title` no computador).
- Nada depende só de cor: estado marcado também muda texto, borda ou forma.
- Atalhos (`/`, setas, Esc) nunca prendem o foco.

## Movimento

- Só `transform`, `opacity` (e `clip-path` no check do título); tudo dentro de
  `@media (prefers-reduced-motion: no-preference)`, com versão parada.
- Entrada curta ao carregar (depois que o idioma carrega: `html:not(.i18n-pendente)`):
  o logo vira, o título sobe, a lupa procura e o check "acha".
- Ícones flutuando no fundo do herói, com parallax do mouse; param fora da
  tela. Passos e cards inclinam na direção do mouse (`js/views/profundidade.js`,
  só variáveis CSS). Nada de camada de GPU em repouso nos milhares de cards.
- Lupa e check do título ficam presos aos cantos do texto por anchor
  positioning (lupa no canto superior esquerdo, check no inferior direito);
  sem suporte (Firefox), o check segue o fim da última palavra.

## Quem volta

- Quem já copiou um ícone (`icon-library:used`) ou escolheu um conjunto
  (`icon-library:set`) recebe o herói compacto (`html.volta`, marcado por
  `js/views/visita.js` no `<head>`, antes de a página aparecer): título de
  30–44 px, sem subtítulo, sem ícones flutuando e sem os passos (fica o link
  do Guia). A grade aparece na primeira tela. A primeira visita e os robôs
  veem a home completa.

## Navegação

- O mesmo cabeçalho em todas as páginas: logo, Guia, Sobre, Artigos, café,
  idioma e tema. Nas páginas de texto ele fica fixo no topo (vidro fosco), e a
  busca vem logo abaixo, seguida do breadcrumb (Icon Library › página), que
  também vai em JSON-LD (`BreadcrumbList`).
- Rodapé só com Privacidade, Licenças e a comunidade (bug, sugestões, Telegram,
  GitHub); Guia, Sobre, Artigos e o café ficam no cabeçalho.
- O Guia começa com "Comece em 30 segundos": os mesmos três passos ilustrados
  da home.

- A busca fica presa no topo ao rolar a grade (`.search-container`, sticky);
  o título de cada categoria gruda logo abaixo dela (`--altura-busca`).
- A grade carrega em lotes de 96 cards enquanto a pessoa desce (rolagem
  infinita, `IconView.proximoLote`).
- O anúncio em faixa fica depois das ferramentas, antes da grade: nunca entre
  o título e a busca.
