import { nomeDeArquivo, paraCss, paraDataUri, paraReact, paraSvelte, paraVue } from "../models/svgTools.js";
import { copiarTexto } from "./clipboard.js";
import { idiomaAtual, lista, t, tErro } from "../i18n/i18n.js";
import { baixarPngDeEmoji, baixarPngDeSvg, baixarSvg } from "./download.js";
import { SEPARADOR, TODOS } from "../models/IconModel.js";

// Cor de "currentColor" num PNG solto, onde não há texto para herdar a cor
const COR_PNG = "#2c3e50";

// Sem ?set= no endereço, a página abre o último conjunto escolhido (guardado
// no navegador) ou este
const CONJUNTO_PADRAO = "lucide";
const CHAVE_CONJUNTO = "icon-library:set";
const CHAVE_USOU = "icon-library:used";

// Liga a view ao model: recebe as ações do usuário, atualiza o estado e manda
// redesenhar.
export class IconController {
  // aoAdicionar(item, svg): botão "+" de um card (envia o ícone ao scratchpad)
  // aoEditar(item, svg): lápis de um card (abre o editor)
  // escolherTamanhoPng(sugerido): pergunta o tamanho do PNG (null = desistiu)
  constructor(model, view, { aoAdicionar, aoEditar, escolherTamanhoPng }) {
    this.model = model;
    this.view = view;
    this.aoAdicionar = aoAdicionar;
    this.aoEditar = aoEditar;
    this.escolherTamanhoPng = escolherTamanhoPng;
  }

  iniciar() {
    const { model, view } = this;
    view.aoFiltrar(() => {
      if (this.seguirBusca()) return;
      this.aplicarFiltros();
      this.salvarNoEndereco();
    });
    view.aoEscolherFonte((chave) => this.escolhaDaPessoa(chave));
    view.aoSomarFonte((chave, marcado) => {
      // Junta ou tira um conjunto dos que estão na tela; tirar o último não
      // vale (as caixas voltam ao que era)
      const atuais = model.chavesDe(model.fonteAtual);
      const nova = model.escolha(marcado ? [...atuais, chave] : atuais.filter((c) => c !== chave));
      if (!nova) {
        view.marcarFonte(atuais, this.rotuloCurto(model.fonteAtual), { fechar: false });
        return;
      }
      this.escolhaDaPessoa(nova, { fechar: false });
    });
    view.aoAlternarGrupo((grupo, marcado) => {
      model.alternarGrupo(grupo, marcado);
      this.atualizarGrupos();
    });
    view.aoLimparGrupos(() => this.limparGrupos());
    view.aoMudarEstilo((mudancas) => {
      model.definirEstilo(mudancas);
      view.mostrarEstilo(model.estilo);
    });
    view.aoRestaurarEstilo(() => {
      model.restaurarEstilo();
      view.mostrarEstilo(model.estilo);
    });
    view.estadoInicial(this.opcoesDoSeletor(), { todos: TODOS });
    view.mostrarEstilo(model.estilo);
    view.habilitarEstilo({ traco: false, cor: false });
    this.lerDoEndereco();
  }

  // As opções do seletor: "Todos os conjuntos" primeiro, depois cada fonte
  opcoesDoSeletor() {
    return { [TODOS]: { rotulo: t("sets.all") }, ...this.model.fontes };
  }

  // Escolha da pessoa (um conjunto, vários ou "Todos"): com busca, ela vale
  // nesses conjuntos até a busca ser apagada, e vira a da próxima visita
  escolhaDaPessoa(chave, { fechar = true } = {}) {
    this.todosAutomatico = false;
    this.origem = null;
    this.escolherFonte(chave, { fechar });
    // "Todos" não vira o conjunto da próxima visita: ele baixa tudo
    if (chave === TODOS) return;
    try {
      localStorage.setItem(CHAVE_CONJUNTO, chave);
    } catch {
      // Sem armazenamento: a próxima visita abre o padrão
    }
  }

  // "Todos os conjuntos", "Lucide" ou "Lucide e Bootstrap"
  rotuloDe(chave) {
    if (chave === TODOS) return t("sets.all");
    return lista(this.model.chavesDe(chave).map((c) => this.model.fontes[c].rotulo));
  }

  // O texto do botão, que é estreito: "Lucide", "Lucide +1"
  rotuloCurto(chave) {
    if (chave === TODOS) return t("sets.all");
    const [primeira, ...outras] = this.model.chavesDe(chave);
    const rotulo = this.model.fontes[primeira].rotulo;
    return outras.length ? `${rotulo} +${outras.length}` : rotulo;
  }

  // Busca em todos os conjuntos: ao começar a digitar, a página troca sozinha
  // para "Todos" (e lembra de onde veio); ao apagar a busca, volta. Se a
  // pessoa escolheu um conjunto com a busca já digitada, fica nele.
  // Devolve true quando trocou (a troca já refaz a grade).
  seguirBusca() {
    const temBusca = this.view.busca.trim() !== "";
    const atual = this.model.fonteAtual;
    // Vários conjuntos escolhidos de propósito: a busca fica neles
    if (temBusca && atual !== TODOS && !this.fixado && !this.model.ehVarios(atual)) {
      this.origem = atual;
      // A home sem ?set= (conjunto implícito) volta a ficar sem ele
      this.origemImplicita = !new URLSearchParams(location.search).has("set");
      this.model.conjuntoPreferido = atual;
      this.todosAutomatico = true;
      this.escolherFonte(TODOS, { focar: false, implicito: true });
      this.salvarNoEndereco();
      return true;
    }
    if (!temBusca) {
      this.fixado = false;
      if (this.todosAutomatico && this.origem) {
        const volta = this.origem;
        this.todosAutomatico = false;
        this.origem = null;
        this.escolherFonte(volta, { focar: false, implicito: true });
        this.salvarNoEndereco({ semConjunto: this.origemImplicita });
        return true;
      }
    }
    return false;
  }

  // O conjunto da próxima visita (ou o padrão)
  conjuntoSalvo() {
    let salvo = null;
    try {
      salvo = localStorage.getItem(CHAVE_CONJUNTO);
    } catch {
      // Sem armazenamento: vale o padrão
    }
    // Pode ser um ("lucide") ou vários ("lucide,bootstrap")
    const escolha = salvo ? this.model.escolha(salvo.split(SEPARADOR)) : null;
    return escolha && escolha !== TODOS ? escolha : CONJUNTO_PADRAO;
  }

  // ── Estado no endereço (?set=lucide&q=heart) ───────────────────────────────
  // Uma busca pode ser compartilhada ou salva nos favoritos
  // Sem conjunto no endereço, abre o último escolhido ou o Lucide, sem
  // escrever ?set= no endereço: a home continua sendo "/" até a pessoa mexer
  lerDoEndereco() {
    const parametros = new URLSearchParams(location.search);
    // ?set=lucide, ?set=lucide,bootstrap ou ?set=all
    const pedido = this.model.escolha((parametros.get("set") ?? "").split(SEPARADOR));
    this.view.variante = { outline: "contorno", filled: "preenchido" }[parametros.get("style")] ?? "todos";
    const busca = parametros.get("q") || "";
    this.view.busca = busca;
    if (pedido) {
      // Conjunto e busca no endereço: a busca fica nesse conjunto
      this.fixado = Boolean(busca) && pedido !== TODOS;
      this.escolherFonte(pedido, { focar: false });
      return;
    }
    if (busca) {
      // ?q= sem conjunto (a busca das páginas de texto): em todos os
      // conjuntos; apagar a busca leva ao conjunto de sempre
      this.origem = this.conjuntoSalvo();
      this.origemImplicita = true;
      this.model.conjuntoPreferido = this.origem;
      this.todosAutomatico = true;
      this.escolherFonte(TODOS, { focar: false, implicito: true });
    } else this.escolherFonte(this.conjuntoSalvo(), { focar: false, implicito: true });
    // O começo é a busca: com mouse, o cursor já fica nela. No celular, não
    // (abriria o teclado e cobriria a página), nem com um ícone aberto por link.
    if (matchMedia("(pointer: fine)").matches && !location.hash) this.view.focarBusca();
  }

  limparGrupos() {
    this.model.limparGrupos();
    this.view.desmarcarGrupos();
    this.atualizarGrupos();
  }

  // semConjunto: sem ?set= (a home volta a ser "/")
  salvarNoEndereco({ semConjunto = false } = {}) {
    const parametros = new URLSearchParams();
    // Um ?lang= de quem chegou por link (ou buscador) fica no endereço
    const idioma = new URLSearchParams(location.search).get("lang");
    if (idioma) parametros.set("lang", idioma);
    // "Todos" escolhido por digitar não vai para o endereço: ?q= sozinho já
    // quer dizer todos os conjuntos
    if (this.model.fonteAtual && !this.todosAutomatico && !semConjunto) parametros.set("set", this.model.fonteAtual);
    const busca = this.view.busca.trim();
    if (busca) parametros.set("q", busca);
    // O conjunto escolhido, não o exibido: este ainda pode estar carregando
    const comVariantes = this.model.fontes[this.model.fonteAtual]?.temVariantes;
    const estilo = comVariantes ? { contorno: "outline", preenchido: "filled" }[this.view.variante] : null;
    if (estilo) parametros.set("style", estilo);
    // A vírgula de ?set=lucide,bootstrap fica legível no endereço
    const consulta = parametros.toString().replace(/%2C/gi, SEPARADOR);
    // replaceState: digitar não enche o histórico do navegador. O "#…"
    // fica: pode ser um ícone aberto no editor por link (#svg=…)
    history.replaceState(
      null,
      "",
      (consulta ? `?${consulta}` : location.pathname) + location.hash,
    );
  }

  escolherFonte(chave, { focar = true, implicito = false, fechar = true } = {}) {
    // Um conjunto escolhido com a busca já digitada fica fixo para ela
    if (!implicito && chave !== TODOS && this.view.busca.trim()) this.fixado = true;
    this.view.marcarFonte(this.model.chavesDe(chave), this.rotuloCurto(chave), { focar, fechar });
    if (chave !== this.model.fonteAtual) this.trocarFonte(chave, { implicito });
  }

  // implicito: o conjunto padrão da primeira visita, que não vai para o endereço
  async trocarFonte(chave, { implicito = false } = {}) {
    const { model, view } = this;
    model.fonteAtual = chave;
    if (!implicito) this.salvarNoEndereco();
    try {
      const todos = chave === TODOS;
      const chaves = model.chavesDe(chave);
      if (!chaves.every((c) => model.emCache(c)))
        view.mostrarCarregando(this.rotuloDe(chave), { todos });
      const dados = chaves.length > 1 ? await model.carregarVarias(chaves) : await model.carregar(chave);
      // O usuário trocou de conjunto enquanto este carregava
      if (chave !== model.fonteAtual) return;

      model.exibir(chave, dados);
      view.mostrarFiltroVariante(model.temVariantes);
      view.habilitarEstilo(model.personalizavel);
      view.renderGrupos(model.contarGrupos());
      view.renderResumo(model.resumo());
      view.esconderCarregando();
      this.atualizarGrupos();
    } catch (erro) {
      if (chave !== model.fonteAtual) return;
      view.mostrarErro(tErro(erro));
    }
  }

  atualizarGrupos() {
    this.view.atualizarRotuloGrupos(
      this.model.gruposEscolhidos,
      t(this.model.rotuloTodos),
    );
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    const grupos = this.model.filtrar({
      busca: this.view.busca,
      apenasSuportados: this.view.apenasSuportados,
      variante: this.view.variante,
    });
    this.view.renderGrid(grupos, {
      aoClicar: (item) => this.copiarPrincipal(item),
      aoClicarDireito: (item) => this.copiarAlternativa(item),
      aoAdicionar: (item) => this.aoAdicionar(item, this.model.svgFinal(item)),
      aoMenu: (acao, item) => this.executarMenu(acao, item),
      // O editor abre com a cor do texto (currentColor), não com a cor
      // escolhida na página: a cor se escolhe lá dentro, por forma
      aoEditar: (item) => this.aoEditar(item, this.model.svgFinal(item, { semCor: true })),
      // Conjunto sem nenhum ícone (Iconlibrary no começo): mensagem própria
      vazio: this.model.itens.length ? null : this.model.fonteExibida?.vazio,
      semResultado: this.semResultado(),
      aoLimparBusca: () => {
        this.view.busca = "";
        this.aplicarFiltros();
        this.salvarNoEndereco();
        this.view.focarBusca();
      },
      aoLimparGrupos: () => this.limparGrupos(),
      aoProcurarEm: (chave) => this.escolherFonte(chave),
    });
    const total = grupos.reduce((soma, [, itens]) => soma + itens.length, 0);
    if (!total) this.registrarBuscaPerdida();
  }

  // Busca que não achou nada: depois de 2 s sem digitar, manda o termo, o
  // conjunto e o idioma ao servidor (scripts/searchMisses.js), uma vez por
  // termo e conjunto nesta visita. Com categorias escolhidas não manda: o
  // "nada" pode ser culpa do filtro, não da falta do ícone.
  registrarBuscaPerdida() {
    clearTimeout(this.esperaBuscaPerdida);
    const termo = this.view.busca.trim().toLowerCase();
    const conjunto = this.model.fonteAtual;
    // Vários conjuntos juntos não vão: o servidor só conta um conjunto ou "all"
    if (termo.length < 2 || !conjunto || conjunto.includes(SEPARADOR)) return;
    if (this.model.gruposEscolhidos.size || !this.model.itens.length) return;
    this.buscasEnviadas ??= new Set();
    const chave = `${conjunto}:${termo}`;
    if (this.buscasEnviadas.has(chave)) return;
    this.esperaBuscaPerdida = setTimeout(() => {
      if (this.view.busca.trim().toLowerCase() !== termo || this.model.fonteAtual !== conjunto) return;
      this.buscasEnviadas.add(chave);
      fetch("/api/search-misses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: termo, set: conjunto, lang: idiomaAtual() }),
        keepalive: true,
      }).catch(() => {});
    }, 2000);
  }

  // Busca sem resultado: o que dá para fazer (limpar a busca, as categorias,
  // procurar nos outros conjuntos, com a contagem dos que já foram baixados)
  semResultado() {
    const { model, view } = this;
    if (!model.itens.length) return null;
    const busca = view.busca.trim();
    return {
      busca,
      comGrupos: model.gruposEscolhidos.size > 0,
      outros: busca && !model.modoTodos
        ? Object.entries(model.fontes)
            .filter(([chave]) => chave !== model.fonteAtual)
            .map(([chave, fonte]) => ({ chave, rotulo: fonte.rotulo, n: model.contarEm(chave, busca) }))
            .filter((outro) => outro.n !== 0)
        : [],
    };
  }

  copiarPrincipal(item) {
    if (item.tipo === "svg") this.copiar(this.model.svgFinal(item), t("toast.svgCopied"));
    else
      this.copiar(
        item.char,
        item.suportado
          ? t("toast.emojiCopied", { char: item.char })
          : t("toast.emojiNoGlyph", { version: item.versao }),
      );
  }

  copiarAlternativa(item) {
    if (item.tipo === "svg")
      this.copiar(item.nome, t("toast.nameCopied", { name: item.nome }));
    else
      this.copiar(
        this.model.svgFinal(item),
        t("toast.emojiSvgCopied"),
      );
  }

  // Opções do menu "⋯" de um card
  async executarMenu(acao, item) {
    const svg = this.model.svgFinal(item);
    const arquivo = nomeDeArquivo(item.nome);
    const { cor } = this.model.estilo;
    let { tamanho } = this.model.estilo;
    if (acao === "svg") {
      baixarSvg(svg, arquivo);
      this.view.mostrarToast(t("toast.downloading", { file: `${arquivo}.svg` }));
    } else if (acao === "png") {
      // Pergunta o tamanho; o do controle "Tamanho" é a sugestão
      if (this.escolherTamanhoPng) tamanho = await this.escolherTamanhoPng(tamanho);
      if (!tamanho) return;
      const baixando =
        item.tipo === "emoji"
          ? baixarPngDeEmoji(item.char, tamanho, arquivo)
          : baixarPngDeSvg(svg, tamanho, cor || COR_PNG, arquivo);
      baixando.then(
        () => this.view.mostrarToast(t("toast.downloadingPng", { file: `${arquivo}.png`, size: tamanho })),
        () => this.view.mostrarToast(t("toast.pngFailed")),
      );
    } else if (acao === "react") {
      this.copiar(paraReact(svg, item.nome), t("toast.reactCopied"));
    } else if (acao === "vue") {
      this.copiar(paraVue(svg), t("toast.vueCopied"));
    } else if (acao === "svelte") {
      this.copiar(paraSvelte(svg), t("toast.svelteCopied"));
    } else if (acao === "dataUri") {
      this.copiar(paraDataUri(svg, cor || COR_PNG), t("toast.dataUriCopied"));
    } else if (acao === "css") {
      this.copiar(paraCss(svg, item.nome, { mascara: item.tipo === "svg", tamanho }), t("toast.cssCopied"));
    }
  }

  copiar(texto, mensagem) {
    copiarTexto(texto).then(
      () => {
        this.view.mostrarToast(mensagem);
        // Já usou o site: a próxima visita abre o herói compacto (visita.js)
        try {
          localStorage.setItem(CHAVE_USOU, "1");
        } catch {
          // Sem armazenamento: a home segue completa
        }
      },
      () => this.view.mostrarToast(t("toast.copyBlocked")),
    );
  }
}
