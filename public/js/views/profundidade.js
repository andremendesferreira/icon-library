// Profundidade: os cards inclinam na direção do mouse, o fundo do herói
// acompanha o ponteiro (parallax) e o card clicado ganha um pulso de "copiado".
// Só escreve variáveis CSS (--rx, --ry, --px, --py) e uma classe; o CSS anima
// apenas transform/opacity. Nada roda no toque nem com "reduzir movimento".
// Um ouvinte por área, nunca um por card.
(() => {
  const mouse = matchMedia("(hover: hover) and (pointer: fine)");
  const calmo = matchMedia("(prefers-reduced-motion: reduce)");
  const ativo = () => mouse.matches && !calmo.matches;

  // Inclina o card sob o ponteiro em até `graus`; mede a caixa uma vez ao entrar
  function inclinar(raiz, seletor, graus) {
    if (!raiz) return;
    let alvo = null;
    let caixa = null;
    let evento = null;
    let quadro = 0;
    const soltar = () => {
      if (!alvo) return;
      alvo.style.removeProperty("--rx");
      alvo.style.removeProperty("--ry");
      alvo = caixa = null;
    };
    const aplicar = () => {
      quadro = 0;
      const card = evento.target instanceof Element ? evento.target.closest(seletor) : null;
      if (card !== alvo) {
        soltar();
        if (!card || !raiz.contains(card)) return;
        alvo = card;
        caixa = card.getBoundingClientRect();
      }
      const x = (evento.clientX - caixa.left) / caixa.width - 0.5;
      const y = (evento.clientY - caixa.top) / caixa.height - 0.5;
      alvo.style.setProperty("--ry", `${(x * graus * 2).toFixed(2)}deg`);
      alvo.style.setProperty("--rx", `${(-y * graus * 2).toFixed(2)}deg`);
    };
    raiz.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerType !== "mouse" || !ativo()) return;
        evento = e;
        if (!quadro) quadro = requestAnimationFrame(aplicar);
      },
      { passive: true },
    );
    raiz.addEventListener("pointerleave", soltar);
    // Rolou com o mouse parado: a caixa medida ficou velha
    addEventListener("scroll", soltar, { passive: true });
  }

  // Parallax do fundo do herói; pausa a flutuação quando ele sai da tela
  function parallax(heroi) {
    const fundo = heroi?.querySelector(".heroi__fundo");
    if (!fundo) return;
    let visivel = true;
    let quadro = 0;
    let px = 0;
    let py = 0;
    new IntersectionObserver(([entrada]) => {
      visivel = entrada.isIntersecting;
      fundo.toggleAttribute("data-fora", !visivel);
    }).observe(heroi);
    addEventListener(
      "pointermove",
      (e) => {
        if (!visivel || e.pointerType !== "mouse" || !ativo()) return;
        px = (e.clientX / innerWidth) * 2 - 1;
        py = (e.clientY / innerHeight) * 2 - 1;
        if (quadro) return;
        quadro = requestAnimationFrame(() => {
          quadro = 0;
          fundo.style.setProperty("--px", px.toFixed(3));
          fundo.style.setProperty("--py", py.toFixed(3));
        });
      },
      { passive: true },
    );
  }

  // Pulso de "copiado" no card clicado (os botões dos cantos não contam)
  function pulsoDeCopia(grade) {
    if (!grade) return;
    grade.addEventListener("click", (e) => {
      if (!(e.target instanceof Element) || e.target.closest(".emoji-card__action")) return;
      const card = e.target.closest(".emoji-card");
      if (!card) return;
      card.classList.remove("emoji-card--copiado");
      void card.offsetWidth; // recomeça a animação num segundo clique seguido
      card.classList.add("emoji-card--copiado");
    });
    grade.addEventListener("animationend", (e) => {
      if (e.animationName.startsWith("card-copiado")) e.target.classList.remove("emoji-card--copiado");
    });
  }

  // Logo da busca presa: volta ao topo sem mexer nos filtros e devolve o foco
  // à busca (só com mouse, para não abrir teclado). Ctrl/Cmd/Shift/meio: segue
  // o href e abre a home limpa.
  function logoDaBusca(link) {
    if (!link) return;
    link.addEventListener("click", (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      scrollTo({ top: 0, behavior: calmo.matches ? "auto" : "smooth" });
      if (mouse.matches) document.getElementById("search-bar")?.focus({ preventScroll: true });
    });
  }
  logoDaBusca(document.querySelector(".marca-presa"));

  // Cabeçalho fixo das páginas de texto: ao rolar, ganha linha e sombra
  // (o vidro fosco é do CSS; aqui só a marca de "preso")
  const fixo = document.querySelector(".topo--fixo");
  if (fixo) {
    const marcar = () => fixo.classList.toggle("topo--presa", scrollY > 4);
    addEventListener("scroll", marcar, { passive: true });
    marcar();
  }

  const grade = document.getElementById("emoji-container");
  inclinar(document.querySelector(".passos"), ".passo", 6);
  inclinar(grade, ".emoji-card", 8);
  parallax(document.querySelector(".heroi"));
  pulsoDeCopia(grade);
})();
