import { escapar } from "./html.js";
import { lista, numero, t } from "../i18n/i18n.js";

const porId = (id) => document.getElementById(id);

// Altura estimada de um card e espaço entre eles: reservam o lugar das
// categorias ainda não desenhadas, para a barra de rolagem já ter o tamanho certo
const ALTURA_CARD = 106;
const ESPACO = 15;
const LARGURA_MIN_CARD = 110;

const ICONE_MAIS =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ICONE_LAPIS =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICONE_MENU =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';

// Tudo o que toca o DOM: desenha a página e avisa o controller das ações do
// usuário. Não guarda dados nem decide o que fazer com eles.
export class IconView {
  container = porId("emoji-container");
  loader = porId("loader");
  loaderTexto = porId("loader-text");
  searchBar = porId("search-bar");
  toast = porId("toast");
  seletor = porId("icon-set-button");
  seletorTexto = porId("icon-set-button-text");
  painelFontes = porId("icon-set-panel");
  botaoGrupos = porId("groups-button");
  botaoGruposTexto = porId("groups-button-text");
  painelGrupos = porId("groups-panel");
  gruposLista = porId("groups-list");
  gruposLimpar = porId("groups-clear");
  filtroSup = porId("only-supported");
  campoFiltro = porId("supported-filter-field");
  resumo = porId("summary");
  tamanho = porId("style-size");
  tamanhoValor = porId("style-size-value");
  traco = porId("style-stroke");
  tracoValor = porId("style-stroke-value");
  cor = porId("style-color");
  corValor = porId("style-color-value");
  estiloRestaurar = porId("style-reset");
  toastTimer = null;

  // Itens da grade atual, na ordem dos cards (data-i aponta para cá)
  itensGrade = [];
  acoes = null;
  observador = null;
  menu = null;
  itemDoMenu = null;

  constructor() {
    this.ligarPaineis();
    this.ligarGrade();
    this.criarMenu();
  }

  // ── Leitura dos controles ──────────────────────────────────────────────────
  get busca() {
    return this.searchBar.value;
  }

  set busca(valor) {
    this.searchBar.value = valor;
  }

  get apenasSuportados() {
    return this.filtroSup.checked;
  }

  // ── Ações do usuário ───────────────────────────────────────────────────────
  aoFiltrar(acao) {
    this.searchBar.addEventListener("input", acao);
    this.filtroSup.addEventListener("change", acao);
  }

  aoEscolherFonte(acao) {
    this.painelFontes.addEventListener("click", (evento) => {
      const opcao = evento.target.closest("[data-icon-set]");
      if (opcao) acao(opcao.dataset.iconSet);
    });
  }

  aoAlternarGrupo(acao) {
    this.gruposLista.addEventListener("change", (evento) => {
      acao(evento.target.value, evento.target.checked);
    });
  }

  aoLimparGrupos(acao) {
    this.gruposLimpar.addEventListener("click", acao);
  }

  aoMudarEstilo(acao) {
    this.tamanho.addEventListener("input", () =>
      acao({ tamanho: Number(this.tamanho.value) }),
    );
    this.traco.addEventListener("input", () =>
      acao({ traco: Number(this.traco.value) }),
    );
    this.cor.addEventListener("input", () => acao({ cor: this.cor.value }));
  }

  aoRestaurarEstilo(acao) {
    this.estiloRestaurar.addEventListener("click", acao);
  }

  // ── Painéis (conjunto e categorias) ────────────────────────────────────────
  // Abrir, fechar e navegar pelo teclado é comportamento só de interface.
  ligarPaineis() {
    this.botaoGrupos.addEventListener("click", (evento) => {
      evento.stopPropagation();
      this.abrirPainelFontes(false);
      this.abrirPainelGrupos(this.painelGrupos.hidden);
    });
    this.painelGrupos.addEventListener("click", (evento) =>
      evento.stopPropagation(),
    );
    this.seletor.addEventListener("click", (evento) => {
      evento.stopPropagation();
      this.abrirPainelGrupos(false);
      this.abrirPainelFontes(this.painelFontes.hidden);
    });
    this.painelFontes.addEventListener("click", (evento) =>
      evento.stopPropagation(),
    );
    // Setas percorrem as opções, como num <select>
    this.painelFontes.addEventListener("keydown", (evento) => {
      if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
      evento.preventDefault();
      const opcoes = [...this.painelFontes.querySelectorAll("[data-icon-set]")];
      const atual = opcoes.indexOf(document.activeElement);
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      opcoes[(atual + passo + opcoes.length) % opcoes.length].focus();
    });
    document.addEventListener("click", () => {
      this.abrirPainelGrupos(false);
      this.abrirPainelFontes(false);
      this.fecharMenu();
    });
    document.addEventListener("keydown", (evento) => {
      if (evento.key !== "Escape") return;
      const fontesAberto = !this.painelFontes.hidden;
      this.abrirPainelGrupos(false);
      this.abrirPainelFontes(false);
      this.fecharMenu();
      if (fontesAberto) this.seletor.focus();
    });
  }

  abrirPainelGrupos(aberto) {
    this.painelGrupos.hidden = !aberto;
    this.botaoGrupos.setAttribute("aria-expanded", String(aberto));
  }

  abrirPainelFontes(aberto) {
    this.painelFontes.hidden = !aberto;
    this.seletor.setAttribute("aria-expanded", String(aberto));
    if (aberto) {
      const opcao =
        this.painelFontes.querySelector('[aria-selected="true"]') ||
        this.painelFontes.querySelector("[data-icon-set]");
      opcao?.focus();
    }
  }

  // ── Seletor de conjunto ────────────────────────────────────────────────────
  // Botão + painel, no lugar do antigo <select>. Nada é carregado até a escolha.
  estadoInicial(fontes) {
    this.painelFontes.innerHTML = Object.entries(fontes)
      .map(
        ([chave, fonte]) =>
          `<button type="button" role="option" class="icon-set__option" data-icon-set="${chave}" aria-selected="false">${fonte.rotulo}</button>`,
      )
      .join("");
    this.botaoGrupos.disabled = true;
    this.searchBar.disabled = true;
    this.campoFiltro.hidden = true;
    this.container.innerHTML =
      `<p class="empty">${escapar(t("grid.start"))}</p>`;
  }

  // focar: false quando a escolha vem do endereço da página, não de um clique
  marcarFonte(chave, rotulo, { focar = true } = {}) {
    this.painelFontes.querySelectorAll("[data-icon-set]").forEach((opcao) => {
      opcao.setAttribute(
        "aria-selected",
        String(opcao.dataset.iconSet === chave),
      );
    });
    this.seletorTexto.textContent = rotulo;
    this.seletor.classList.add("icon-set__button--active");
    this.botaoGrupos.disabled = false;
    this.searchBar.disabled = false;
    this.abrirPainelFontes(false);
    if (focar) this.seletor.focus();
  }

  // ── Personalização (tamanho, traço, cor) ───────────────────────────────────
  mostrarEstilo({ tamanho, traco, cor }) {
    this.tamanho.value = tamanho;
    this.tamanhoValor.textContent = `${tamanho}px`;
    this.traco.value = traco;
    this.tracoValor.textContent = traco;
    // <input type="color"> não aceita "currentColor": mostra a cor do texto
    this.cor.value = cor || "#2c3e50";
    this.corValor.textContent = cor || t("style.textColor");
    // A prévia dos cards acompanha traço e cor (o tamanho fica fixo na grade)
    this.container.style.setProperty("--icon-stroke", traco);
    if (cor) this.container.style.setProperty("--icon-color", cor);
    else this.container.style.removeProperty("--icon-color");
  }

  // Emoji não tem traço nem cor; Bootstrap (preenchido) não tem traço
  habilitarEstilo({ traco, cor }) {
    this.traco.disabled = !traco;
    this.cor.disabled = !cor;
  }

  // ── Carregamento ───────────────────────────────────────────────────────────
  mostrarCarregando(rotulo) {
    this.limparGrade();
    this.loader.style.display = "";
    this.loaderTexto.style.color = "";
    this.loaderTexto.textContent = t("loading.set", { set: rotulo });
  }

  esconderCarregando() {
    this.loader.style.display = "none";
  }

  mostrarErro(mensagem) {
    this.loader.style.display = "";
    this.loaderTexto.textContent = t("loading.error", { message: mensagem });
    this.loaderTexto.style.color = "#e74c3c";
  }

  // ── Categorias ─────────────────────────────────────────────────────────────
  mostrarFiltroSuporte(visivel) {
    this.campoFiltro.hidden = !visivel;
  }

  renderGrupos(contagem) {
    this.gruposLista.innerHTML = contagem
      .map(
        ([grupo, quantidade]) => `
        <label class="groups-menu__item">
            <input type="checkbox" value="${escapar(grupo)}">
            <span class="groups-menu__name">${escapar(grupo)}</span>
            <span class="groups-menu__count">${quantidade}</span>
        </label>`,
      )
      .join("");
  }

  desmarcarGrupos() {
    this.gruposLista.querySelectorAll("input").forEach((caixa) => {
      caixa.checked = false;
    });
  }

  atualizarRotuloGrupos(escolhidos, rotuloTodos) {
    const quantidade = escolhidos.size;
    this.botaoGruposTexto.textContent =
      quantidade === 0
        ? rotuloTodos
        : quantidade === 1
          ? [...escolhidos][0]
          : t("categories.count", { n: quantidade });
    this.botaoGrupos.classList.toggle(
      "groups-menu__button--active",
      quantidade > 0,
    );
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  renderResumo({ total, emoji, semDesenho, versoes }) {
    if (!emoji) {
      this.resumo.innerHTML = t("summary.vectorHtml", { total: numero(total) });
      return;
    }
    this.resumo.innerHTML = semDesenho
      ? t("summary.emojiMissingHtml", {
          total: numero(total),
          missing: numero(semDesenho),
          versions: escapar(lista(versoes)),
        })
      : t("summary.emojiAllHtml", { total: numero(total) });
  }

  // ── Grade de ícones ────────────────────────────────────────────────────────
  // Só os títulos das categorias são criados de imediato; os cards de cada uma
  // nascem quando ela chega perto da tela. Com ~2000 ícones, criar tudo de uma
  // vez travava a página por um instante a cada busca.
  //
  // acoes: { aoClicar, aoClicarDireito, aoAdicionar, aoMenu, aoEditar }
  renderGrid(grupos, acoes) {
    this.limparGrade();
    this.acoes = acoes;
    if (!grupos.length) {
      this.container.innerHTML =
        `<p class="empty">${escapar(t(acoes.vazio || "grid.empty"))}</p>`;
      return;
    }
    const colunas = Math.max(
      1,
      Math.floor(
        (this.container.clientWidth + ESPACO) / (LARGURA_MIN_CARD + ESPACO),
      ),
    );
    this.container.innerHTML = grupos
      .map(([grupo, itens]) => {
        const inicio = this.itensGrade.length;
        this.itensGrade.push(...itens);
        const linhas = Math.ceil(itens.length / colunas);
        const reserva = linhas * ALTURA_CARD + (linhas - 1) * ESPACO;
        return `<section class="group" data-inicio="${inicio}" data-fim="${this.itensGrade.length}"><h2 class="group__title">${escapar(grupo)}<span class="group__count">${itens.length}</span></h2><div class="emoji-grid" style="min-height:${reserva}px"></div></section>`;
      })
      .join("");

    this.observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          this.observador.unobserve(entrada.target);
          this.preencherGrupo(entrada.target);
        }
      },
      // Começa a desenhar um pouco antes de a categoria aparecer
      { rootMargin: "800px 0px" },
    );
    for (const secao of this.container.querySelectorAll(".group"))
      this.observador.observe(secao);
  }

  limparGrade() {
    this.observador?.disconnect();
    this.observador = null;
    this.itensGrade = [];
    this.container.innerHTML = "";
    this.fecharMenu();
  }

  preencherGrupo(secao) {
    const inicio = Number(secao.dataset.inicio);
    const fim = Number(secao.dataset.fim);
    const grade = secao.querySelector(".emoji-grid");
    let html = "";
    for (let i = inicio; i < fim; i++)
      html += this.htmlDoCard(this.itensGrade[i], i);
    grade.innerHTML = html;
    grade.style.minHeight = "";
  }

  htmlDoCard(item, indice) {
    const nome = escapar(item.nome);
    const versao = escapar(item.versao ?? "");
    const titulo =
      item.tipo === "svg"
        ? t("card.titleSvg")
        : item.suportado
          ? t("card.titleEmoji")
          : t("card.titleNoGlyph", { version: item.versao ?? "" });
    // Ícones da Iconlibrary trazem o crédito de quem publicou
    const credito = item.autor ? `\n${t("card.by", { author: item.autor })}` : "";
    const icone =
      item.tipo === "svg"
        ? `<span class="svg-icon">${item.svg}</span>`
        : `<span class="emoji-char">${item.char}</span>`;
    // Ícones vetoriais abrem no editor; emoji é texto, não tem o que editar
    const editar =
      item.tipo === "svg"
        ? `<button type="button" class="emoji-card__action emoji-card__edit" title="${escapar(t("card.edit"))}" aria-label="${escapar(t("card.editLabel", { name: item.nome }))}">${ICONE_LAPIS}</button>`
        : "";
    return `<div class="emoji-card${item.suportado ? "" : " emoji-card--no-glyph"}" data-i="${indice}" title="${escapar(titulo + credito)}">
        <div class="emoji-card__actions emoji-card__actions--start">${editar}</div>
        <div class="emoji-card__actions">
          <button type="button" class="emoji-card__action emoji-card__add" title="${escapar(t("card.add"))}" aria-label="${escapar(t("card.addLabel", { name: item.nome }))}">${ICONE_MAIS}</button>
          <button type="button" class="emoji-card__action emoji-card__more" title="${escapar(t("card.more"))}" aria-label="${escapar(t("card.moreLabel", { name: item.nome }))}" aria-haspopup="menu">${ICONE_MENU}</button>
        </div>
        ${icone}
        <span class="emoji-name">${nome}</span>
        ${item.suportado ? "" : `<span class="emoji-warning">${escapar(t("card.noGlyph", { version: item.versao ?? "" }))}</span>`}
      </div>`;
  }

  // Um ouvinte para a grade inteira, em vez de três por card
  ligarGrade() {
    const itemDe = (alvo) => {
      const card = alvo.closest(".emoji-card");
      return card ? this.itensGrade[Number(card.dataset.i)] : null;
    };
    this.container.addEventListener("click", (evento) => {
      const item = itemDe(evento.target);
      if (!item || !this.acoes) return;
      if (evento.target.closest(".emoji-card__edit")) {
        this.acoes.aoEditar(item);
        return;
      }
      if (evento.target.closest(".emoji-card__add")) {
        this.acoes.aoAdicionar(item);
        return;
      }
      const botaoMenu = evento.target.closest(".emoji-card__more");
      if (botaoMenu) {
        evento.stopPropagation();
        this.alternarMenu(botaoMenu, item);
        return;
      }
      this.acoes.aoClicar(item);
    });
    this.container.addEventListener("contextmenu", (evento) => {
      const item = itemDe(evento.target);
      if (!item || !this.acoes) return;
      evento.preventDefault();
      this.acoes.aoClicarDireito(item);
    });
  }

  // ── Menu "⋯" do card (downloads e React) ──────────────────────────────────
  criarMenu() {
    this.menu = document.createElement("div");
    this.menu.className = "card-menu";
    this.menu.setAttribute("role", "menu");
    this.menu.hidden = true;
    this.menu.innerHTML = `
      <button type="button" role="menuitem" data-acao="svg">${escapar(t("menu.svg"))}</button>
      <button type="button" role="menuitem" data-acao="png">${escapar(t("menu.png"))}</button>
      <button type="button" role="menuitem" data-acao="react">${escapar(t("menu.react"))}</button>`;
    document.body.appendChild(this.menu);
    this.menu.addEventListener("click", (evento) => {
      evento.stopPropagation();
      const opcao = evento.target.closest("[data-acao]");
      if (!opcao || !this.itemDoMenu) return;
      const item = this.itemDoMenu;
      this.fecharMenu();
      this.acoes.aoMenu(opcao.dataset.acao, item);
    });
    // Menu fixo na tela: some ao rolar, em vez de se descolar do card
    window.addEventListener("scroll", () => this.fecharMenu(), { passive: true });
  }

  alternarMenu(botao, item) {
    if (!this.menu.hidden && this.itemDoMenu === item) {
      this.fecharMenu();
      return;
    }
    this.itemDoMenu = item;
    this.menu.hidden = false;
    const caixa = botao.getBoundingClientRect();
    const largura = this.menu.offsetWidth;
    const altura = this.menu.offsetHeight;
    const esquerda = Math.min(
      Math.max(8, caixa.right - largura),
      window.innerWidth - largura - 8,
    );
    // Abre para cima quando não cabe abaixo do botão
    const topo =
      caixa.bottom + 4 + altura > window.innerHeight
        ? caixa.top - altura - 4
        : caixa.bottom + 4;
    this.menu.style.left = `${esquerda}px`;
    this.menu.style.top = `${topo}px`;
    this.menu.querySelector("button").focus({ preventScroll: true });
  }

  fecharMenu() {
    if (!this.menu || this.menu.hidden) return;
    this.menu.hidden = true;
    this.itemDoMenu = null;
  }

  // ── Aviso ──────────────────────────────────────────────────────────────────
  mostrarToast(mensagem) {
    clearTimeout(this.toastTimer);
    // Uma janela modal (o editor) fica por cima de tudo: o aviso vai para
    // dentro dela enquanto estiver aberta
    const dono = document.querySelector("dialog[open]") || document.body;
    if (this.toast.parentElement !== dono) dono.appendChild(this.toast);
    this.toast.innerText = mensagem;
    this.toast.className = "show";
    this.toastTimer = setTimeout(() => {
      this.toast.className = "";
    }, 2500);
  }
}
