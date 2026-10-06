const porId = (id) => document.getElementById(id);

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
  toastTimer = null;

  constructor() {
    this.ligarPaineis();
  }

  // ── Leitura dos controles ──────────────────────────────────────────────────
  get busca() {
    return this.searchBar.value;
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
    });
    document.addEventListener("keydown", (evento) => {
      if (evento.key !== "Escape") return;
      const fontesAberto = !this.painelFontes.hidden;
      this.abrirPainelGrupos(false);
      this.abrirPainelFontes(false);
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
      '<p class="empty">Select an icon set above to start.</p>';
  }

  marcarFonte(chave, rotulo) {
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
    this.seletor.focus();
  }

  // ── Carregamento ───────────────────────────────────────────────────────────
  mostrarCarregando(rotulo) {
    this.container.innerHTML = "";
    this.loader.style.display = "";
    this.loaderTexto.style.color = "";
    this.loaderTexto.textContent = `Loading ${rotulo}…`;
  }

  esconderCarregando() {
    this.loader.style.display = "none";
  }

  mostrarErro(mensagem) {
    this.loader.style.display = "";
    this.loaderTexto.textContent = "Error loading icon set: " + mensagem;
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
            <input type="checkbox" value="${grupo}">
            <span class="groups-menu__name">${grupo}</span>
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
          : `${quantidade} categories`;
    this.botaoGrupos.classList.toggle(
      "groups-menu__button--active",
      quantidade > 0,
    );
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  renderResumo({ total, emoji, semDesenho, versoes }) {
    if (!emoji) {
      this.resumo.innerHTML = `<strong>${total}</strong> Vector icons — they do not depend on the system font
            and inherit the text color. Clicking copies the SVG, ready to paste.`;
      return;
    }
    this.resumo.innerHTML = semDesenho
      ? `<strong>${total}</strong> emojis · <strong>${semDesenho}</strong> no design on this
           machine (Emoji ${versoes.join(" e ")}) — No font available today covers them, not even Noto.`
      : `<strong>${total}</strong> emojis, all with designs available.`;
  }

  // ── Grade de ícones ────────────────────────────────────────────────────────
  renderGrid(grupos, { aoClicar, aoClicarDireito }) {
    this.container.innerHTML = "";
    if (!grupos.length) {
      this.container.innerHTML =
        '<p class="empty">No icon for this filter.</p>';
      return;
    }
    for (const [grupo, itens] of grupos) {
      const secao = document.createElement("section");
      secao.className = "group";
      secao.innerHTML = `<h2 class="group__title">${grupo}<span class="group__count">${itens.length}</span></h2><div class="emoji-grid"></div>`;
      this.container.appendChild(secao);
      const grade = secao.querySelector(".emoji-grid");
      for (const item of itens)
        grade.appendChild(this.criarCard(item, aoClicar, aoClicarDireito));
    }
  }

  criarCard(item, aoClicar, aoClicarDireito) {
    const card = document.createElement("div");
    card.className =
      "emoji-card" + (item.suportado ? "" : " emoji-card--no-glyph");
    card.title =
      item.tipo === "svg"
        ? "Click: copy SVG\nRight-click: copy name"
        : item.suportado
          ? "Click: copy emoji\nRight-click: copy as SVG"
          : `No design for this machine (Emoji ${item.versao}) — avoid using in the menu`;
    const icone =
      item.tipo === "svg"
        ? `<span class="svg-icon">${item.svg}</span>`
        : `<span class="emoji-char">${item.char}</span>`;
    card.innerHTML = `
            ${icone}
            <span class="emoji-name">${item.nome}</span>
            ${item.suportado ? "" : `<span class="emoji-warning">without a design · v${item.versao}</span>`}
        `;
    card.addEventListener("click", () => aoClicar(item));
    card.addEventListener("contextmenu", (evento) => {
      evento.preventDefault();
      aoClicarDireito(item);
    });
    return card;
  }

  // ── Aviso ──────────────────────────────────────────────────────────────────
  mostrarToast(mensagem) {
    clearTimeout(this.toastTimer);
    this.toast.innerText = mensagem;
    this.toast.className = "show";
    this.toastTimer = setTimeout(() => {
      this.toast.className = "";
    }, 2500);
  }
}
