# Design do Icon Library

Interface minimalista: o conteúdo (os ícones) é o que tem cor. A marca aparece
no logo e em poucos pontos de ação. Estas regras valem para todas as páginas;
a camada "Design minimalista" no fim de `public/css/icon-library.css` as aplica.

## Marca

- **Logo:** o livro colorido (`img/logo-180.webp`), pequeno no cabeçalho
  (40 px; 32 px no celular), sempre ao lado do nome "Icon Library".
- **Azul da marca** (`--il-action` #1a6ee8, `--il-blue-dark` para texto):
  só para ações (botão principal, link, foco, item marcado).
- **Dourado** (`--il-gold`): só o café. Verde (#1e8449): só o "deu certo".
- **Âmbar** (`--il-warn`): estrelas das avaliações (página Sobre) e avisos.
- **Degradê** só no que a pessoa desenha no editor (as oito sugestões de
  `models/degrade.js`), nunca na interface.
- O resto é neutro: fundo `--cor-fundo`, superfícies `--cor-superficie`,
  bordas `--cor-borda`, texto `--cor-texto` e `--il-muted` (secundário).
- Nada de gradiente em texto nem sombras pesadas; sombra só na busca presa
  no topo e em menus que flutuam.

## Tipografia

| Uso | Tamanho | Variável |
|---|---|---|
| Texto de leitura, controles, menus, avisos | **18 px** (mínimo) | `--fs-texto` |
| Destaque, subtítulo, título de passo, h3 | 20 px | `--fs-mais` |
| h2 das páginas | 24 px | `--fs-h2` |
| Título principal | 30–44 px | `--fs-titulo` |
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

## Navegação

- Páginas de texto: busca no topo e, logo abaixo, o breadcrumb
  (Icon Library › página), que também vai em JSON-LD (`BreadcrumbList`).
- O Guia começa com "Comece em 30 segundos": os mesmos três passos ilustrados
  da home.

- A busca fica presa no topo ao rolar a grade (`.search-container`, sticky);
  o título de cada categoria gruda logo abaixo dela (`--altura-busca`).
- A grade carrega em lotes de 96 cards enquanto a pessoa desce (rolagem
  infinita, `IconView.proximoLote`).
- O anúncio em faixa fica depois das ferramentas, antes da grade: nunca entre
  o título e a busca.
