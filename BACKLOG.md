# Backlog — serviço para IAs e versão paga

Plano para que IAs (Claude, ChatGPT, Cursor e outras) usem o Icon Library para criar e ajustar ícones, e para que o serviço se pague com uma **mensalidade baixa**, acessível a qualquer pessoa.

O site, o editor e os links continuam **gratuitos**. A parte paga é só o que gera custo de servidor: chamadas de API e o servidor MCP.

---

## Situação atual

**Feito — Porta 1: link que abre o editor (gratuito, sem custo de servidor)**

- `https://iconlibrary.io/#name=…&svg=…` e `#ile=…` abrem o editor com o ícone; o conteúdo fica depois do `#`, então não passa pelo servidor.
- Botão *Share link* no editor gera esse link para o projeto atual.
- `/llms.txt`: instruções para IAs — como montar o link, regras de estilo, de onde tirar ícones reais.
- `/schema/ile.schema.json`: JSON Schema do formato `.ile`.
- Testes conferem que os exemplos do `llms.txt` abrem e são válidos.

---

## Fase 2 — Núcleo no servidor (base para tudo o que vem depois)

Hoje a lógica roda no navegador. Para servir IAs, ela precisa rodar no Node.

- [ ] **Leitura de SVG sem navegador.** `lerSvg` usa `DOMParser`. Opções: um leitor próprio (os ícones são planos e simples) ou uma biblioteca só no servidor (ex.: `@xmldom/xmldom`). A limpeza de segurança (scripts, eventos, `javascript:`, `foreignObject`) tem de valer igual nos dois lados.
- [ ] **Índice local de ícones.** Script `npm run build-index` que baixa os pacotes nas versões fixadas e grava nome, categorias e SVG de cada ícone. O serviço não depende do unpkg a cada pedido.
- [ ] **Busca** por nome, categoria e sinônimos sobre o índice.
- [ ] **Operações do editor sem interface:** compor camadas (`importarDocumento`), girar, espelhar, escalar, recolorir forma, espessura — já existem no `EditorModel`, falta uma fachada de "lista de operações → resultado".
- [ ] **Imagem PNG no servidor**, para a IA *ver* o resultado. **Decisão tomada:** o `@resvg/resvg-js` já está no projeto (`scripts/preview.js`, usado pelas prévias da moderação); falta expor a renderização para o serviço da IA.
- [ ] Testes do núcleo rodando no Node (a maior parte já existe em `tests/`).

## Fase 3 — Servidor MCP (o produto principal da versão paga)

MCP (Model Context Protocol) é o padrão para dar ferramentas a assistentes de IA.

Ferramentas:

| Ferramenta | Faz |
|---|---|
| `search_icons(query, set?, category?)` | busca, com nomes e prévias |
| `get_icon(set, name, size?, stroke?, color?, format)` | ícone com estilo; `svg`, `react` ou `ile` |
| `compose_icon(layers[])` | ícone sobre ícone, em uma chamada |
| `edit_icon(svg \| ile, operations[])` | as operações do editor |
| `render_icon(svg)` | PNG da prévia, devolvido como imagem |
| `open_in_editor(ile)` | link da Porta 1, para a pessoa terminar à mão |

Recursos (textos que a IA consulta): regras de estilo de cada conjunto, licenças.

- [ ] Remoto em `https://iconlibrary.io/mcp` (transporte Streamable HTTP), autenticado por chave.
- [ ] Local com `npx icon-library-mcp` (stdio), usando o índice embutido — pode ser gratuito, pois roda na máquina do usuário.
- [ ] Publicar nos diretórios de servidores MCP.

## Fase 4 — API HTTP pública

Sai quase de graça depois da Fase 2.

| Rota | Faz |
|---|---|
| `GET /api/icons?q=&set=&category=` | busca |
| `GET /api/icons/:set/:name.svg?size=&stroke=&color=` | ícone com estilo (também `.jsx`, `.png`) |
| `POST /api/compose` | camadas → SVG + `.ile` |
| `POST /api/edit` | operações → SVG + `.ile` |

- [ ] Especificação OpenAPI (serve também para "ações" de GPTs personalizados).
- [ ] CORS liberado só para leitura; escrita só com chave.

---

## Infraestrutura da versão paga

- [ ] **Contas e chaves de API.** Login simples (link por e-mail), painel com a chave, consumo do mês e plano.
- [ ] **Cobrança recorrente.** Avaliar Stripe e Mercado Pago (Pix e cartão no Brasil). Ver a nota sobre tarifas abaixo.
- [ ] **Limites por plano**, contados por chave: requisições por minuto e por mês, tamanho máximo de entrada, renderizações de PNG.
- [ ] **Cache** de respostas (ícones com estilo são muito repetidos) — reduz CPU e custo.
- [ ] **Banco de dados** para contas, chaves e consumo (SQLite basta no início).
- [ ] **Observabilidade:** logs estruturados, erros, uso por ferramenta, alerta de custo.
- [ ] **Abuso:** bloqueio por chave e por IP, limite de payload, tempo máximo por renderização.
- [ ] **Jurídico:** Termos de Uso; atualizar a Política de Privacidade — passará a haver dados pessoais (e-mail, pagamento), com base legal e direitos do titular pela LGPD.
- [ ] **Suporte:** e-mail próprio do projeto (hoje o contato é pelas issues do GitHub).

## Site — melhorias para depois

Pequenas, independentes da versão paga.

- [ ] **IndexNow** (Bing, Yandex e outros): avisar os buscadores sozinho quando sai uma versão nova, em vez de enviar URLs à mão no Bing Webmaster Tools. Um arquivo de chave em `/<chave>.txt` e, na subida do servidor, se o commit do rodapé mudou desde a última subida, um `POST` para `https://api.indexnow.org/indexnow` com os endereços do sitemap. Guardar o último commit avisado (banco ou arquivo) para não repetir a cada reinício. O Google não usa IndexNow; para ele continua o Search Console.
- [ ] **Sorteio dos códigos de apoiador sem viés.** `newCode` em `scripts/coffee.js` faz `byte % 31`, e algumas letras saem um pouco mais (9/256 contra 8/256). Não muda a segurança na prática (31⁸ ≈ 850 bilhões de combinações e limite de tentativas por IP), mas o certo é descartar os bytes acima de 247 (`crypto.randomInt(31)` já faz isso).

## Preço — como chegar ao valor

Os números dependem de medir o custo real; a regra para não ter prejuízo:

```
preço mensal ≥ (custo mensal do servidor + tarifas de pagamento) ÷ assinantes esperados
```

- **Tarifa fixa por cobrança pesa em mensalidades baixas.** Processadores cobram um percentual *mais* um valor fixo por transação. Numa mensalidade muito baixa, o valor fixo pode levar uma parte grande da receita. Saídas: plano anual com desconto (uma cobrança por ano), Pix onde a tarifa for menor, ou um valor mínimo.
- **Estrutura sugerida:**
  - **Gratuito:** site, editor, links, MCP local; uma cota pequena da API para testar.
  - **Pago (mensal ou anual):** MCP remoto e API com cota alta, PNG no servidor, suporte por e-mail.
- **Custos a levantar:** servidor (VPS) e banda, CPU de renderização de PNG, renovação do domínio `.io`, e-mail transacional, backup.
- O tráfego de API não gera receita de AdSense — a mensalidade é o que paga essa parte.

## Perguntas em aberto

- Aceitar dependências no servidor (PNG, leitura de XML)? Hoje o projeto não tem nenhuma.
- Qual processador de pagamento, e se haverá plano anual.
- Cota gratuita: quanto, e se exige cadastro.
- O MCP local deve ser gratuito e de código aberto (recomendado: aumenta a adoção e não gera custo)?

## Ordem sugerida

1. Fase 2 (núcleo + índice), sem cobrança — validar com uso real.
2. MCP local gratuito — medir interesse.
3. MCP remoto e API com chaves e limites, ainda gratuitos e com cota — medir custo por uso.
4. Com custo medido, definir o preço e ligar a cobrança.
