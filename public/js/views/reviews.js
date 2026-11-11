// Avaliações dos apoiadores, na página Sobre (seção #avaliar, gerada por
// scripts/build-pages.mjs com os textos no idioma da página).
//
// - A seção só aparece quando o servidor tem a função ligada.
// - A lista mostra só avaliações aprovadas; nome e comentário entram como
//   texto (textContent), nunca como HTML.
// - O formulário pede o código de apoiador (já preenchido se este navegador
//   apoiou) e carrega a avaliação anterior para editar.
// - O login com GitHub, Google ou Microsoft sai da página: antes, o que já foi
//   escrito fica no sessionStorage (icon-library:review-draft) e volta depois.
// - A foto é reduzida aqui num canvas (sai JPEG) e o servidor a redesenha.

const $ = (id) => document.getElementById(id);
const PROVEDORES = { github: "GitHub", google: "Google", microsoft: "Microsoft" };
const CHAVE_APOIADOR = "icon-library:supporter";
const CHAVE_RASCUNHO = "icon-library:review-draft";
const LADO_FOTO = 256;

// Volta do login: o ticket sai do endereço já, antes de qualquer espera,
// para não ficar no histórico nem em gravações da página
const HASH_INICIAL = location.hash;
if (/^#review-(ticket|error)=/.test(HASH_INICIAL))
  history.replaceState(null, "", `${location.pathname}${location.search}#avaliar`);

const secao = $("avaliar");
if (secao) iniciar();

function iniciar() {
  const textos = JSON.parse($("avaliacoes-textos").textContent);
  const idioma = document.documentElement.lang || "en";
  const plurais = new Intl.PluralRules(idioma);
  const t = (chave, vars = {}) => {
    let texto = textos[chave] ?? chave;
    if (typeof texto === "object") texto = texto[plurais.select(vars.n ?? 0)] ?? texto.other;
    return String(texto).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  };

  const dialogo = $("avaliacao");
  const form = $("avaliacao-form");
  const campo = {
    codigo: $("avaliacao-codigo"),
    comentario: $("avaliacao-comentario"),
    nome: $("avaliacao-nome"),
    consentimento: $("avaliacao-consentimento"),
    arquivo: $("avaliacao-arquivo"),
    isca: form.elements.website,
  };
  const estrelas = $("avaliacao-estrelas");
  const erro = $("avaliacao-erro");
  const enviar = $("avaliacao-enviar");
  let config = { minComment: 10, maxComment: 600, providers: [] };
  // Como a pessoa aparece: login novo (ticket) ou o da avaliação anterior;
  // foto "keep" (a do login ou a anterior), null (nenhuma) ou data URL nova
  const estado = { ticket: null, provedor: "anonymous", anterior: null, foto: "keep", previa: null };

  // ── Lista ──────────────────────────────────────────────────────────────
  const iniciais = (nome) =>
    String(nome || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => [...p][0] ?? "")
      .join("")
      .toUpperCase() || "?";

  function avatar(url, nome, classe = "") {
    const el = document.createElement("span");
    el.className = `avatar ${classe}`.trim();
    el.setAttribute("aria-hidden", "true");
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.width = 48;
      img.height = 48;
      img.loading = "lazy";
      el.append(img);
    } else el.textContent = iniciais(nome);
    return el;
  }

  const estrelasTexto = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const data = (valor) => {
    try {
      return new Intl.DateTimeFormat(idioma, { dateStyle: "medium" }).format(new Date(valor));
    } catch {
      return "";
    }
  };

  function mostrarLista({ total, average, reviews }) {
    const resumo = $("avaliacoes-resumo");
    resumo.textContent = total
      ? `★ ${t("reviews.summary", { average: new Intl.NumberFormat(idioma, { maximumFractionDigits: 1 }).format(average), n: total })}`
      : t("reviews.empty");
    const lista = $("avaliacoes-lista");
    // As do idioma da página primeiro; cada uma marcada com o próprio idioma
    const ordem = [...reviews].sort((a, b) => (b.lang === idioma) - (a.lang === idioma));
    lista.replaceChildren(
      ...ordem.map((r) => {
        const li = document.createElement("li");
        li.className = "avaliacoes__item";
        if (r.lang) li.lang = r.lang;
        const topo = document.createElement("div");
        topo.className = "avaliacoes__quem";
        const quem = document.createElement("div");
        const nome = document.createElement("p");
        nome.className = "avaliacoes__nome";
        nome.textContent = r.name;
        quem.append(nome);
        if (PROVEDORES[r.provider]) {
          const selo = document.createElement("p");
          selo.className = "avaliacoes__selo";
          selo.textContent = `✓ ${t("reviews.via", { provider: PROVEDORES[r.provider] })}`;
          quem.append(selo);
        }
        topo.append(avatar(r.avatar, r.name), quem);
        const nota = document.createElement("p");
        nota.className = "avaliacoes__estrelas";
        nota.setAttribute("role", "img");
        nota.setAttribute("aria-label", t("reviews.stars", { n: r.rating }));
        nota.textContent = estrelasTexto(r.rating);
        const texto = document.createElement("p");
        texto.className = "avaliacoes__texto";
        texto.textContent = r.comment;
        const quando = document.createElement("p");
        quando.className = "avaliacoes__data";
        quando.textContent = data(r.date);
        li.append(topo, nota, texto, quando);
        return li;
      }),
    );
  }

  async function carregarLista() {
    try {
      const resposta = await fetch("/api/reviews");
      if (resposta.ok) mostrarLista(await resposta.json());
    } catch {}
  }

  // ── Formulário ─────────────────────────────────────────────────────────
  const notaEscolhida = () => Number(form.querySelector('input[name="rating"]:checked')?.value) || 0;
  function marcarEstrelas() {
    estrelas.dataset.nota = String(notaEscolhida());
  }
  function definirNota(n) {
    for (const r of form.querySelectorAll('input[name="rating"]')) r.checked = Number(r.value) === n;
    marcarEstrelas();
  }
  estrelas.addEventListener("change", marcarEstrelas);

  function contar() {
    $("avaliacao-contador").textContent = `${campo.comentario.value.trim().length} / ${config.maxComment} · ${t("reviews.commentHint", { min: config.minComment, max: config.maxComment })}`;
  }
  campo.comentario.addEventListener("input", contar);

  function mostrarAvatar() {
    const caixa = $("avaliacao-avatar");
    caixa.replaceChildren();
    if (estado.previa) {
      const img = document.createElement("img");
      img.src = estado.previa;
      img.alt = "";
      caixa.append(img);
    } else caixa.textContent = estado.foto === "keep" && estado.anterior?.hasPhoto ? "📷" : iniciais(campo.nome.value || t("reviews.nameDefault"));
    $("avaliacao-tirar-foto").hidden = !(estado.previa || (estado.foto === "keep" && estado.anterior?.hasPhoto));
  }
  campo.nome.addEventListener("input", mostrarAvatar);

  function mostrarQuem() {
    const verificado = estado.provedor !== "anonymous";
    $("avaliacao-verificado").hidden = !verificado;
    if (verificado) $("avaliacao-verificado-texto").textContent = `✓ ${t("reviews.via", { provider: PROVEDORES[estado.provedor] })}`;
    const logins = $("avaliacao-logins");
    logins.replaceChildren(
      ...config.providers.map((p) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "avaliacao__login";
        botao.dataset.provedor = p;
        botao.textContent = t("reviews.loginWith", { provider: PROVEDORES[p] });
        return botao;
      }),
    );
    logins.hidden = !config.providers.length;
    $("avaliacao-login-dica").hidden = !config.providers.length;
  }

  // Erro (vermelho) ou aviso (cinza), logo acima dos botões
  function mostrarErro(texto, tipo = "erro") {
    erro.textContent = texto || "";
    erro.dataset.tipo = tipo;
  }

  const ler = (chave, armazenamento = localStorage) => {
    try {
      return JSON.parse(armazenamento.getItem(chave));
    } catch {
      return null;
    }
  };

  // O que já foi escrito, guardado só nesta aba antes de ir ao login
  function guardarRascunho() {
    try {
      sessionStorage.setItem(
        CHAVE_RASCUNHO,
        JSON.stringify({
          codigo: campo.codigo.value,
          nota: notaEscolhida(),
          comentario: campo.comentario.value,
          nome: campo.nome.value,
          consentimento: campo.consentimento.checked,
          foto: estado.foto,
          previa: estado.previa,
        }),
      );
    } catch {}
  }
  function recuperarRascunho() {
    const r = ler(CHAVE_RASCUNHO, sessionStorage);
    try {
      sessionStorage.removeItem(CHAVE_RASCUNHO);
    } catch {}
    if (!r) return false;
    campo.codigo.value = r.codigo || "";
    definirNota(r.nota || 0);
    campo.comentario.value = r.comentario || "";
    campo.nome.value = r.nome || "";
    campo.consentimento.checked = Boolean(r.consentimento);
    if (typeof r.foto === "string" && r.foto.startsWith("data:")) {
      estado.foto = r.foto;
      estado.previa = r.previa;
    }
    return true;
  }

  async function carregarMinha(codigo) {
    try {
      const resposta = await fetch("/api/reviews/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codigo }),
      });
      if (!resposta.ok) return;
      const { review } = await resposta.json();
      if (!review) return;
      estado.anterior = review;
      estado.provedor = review.provider;
      definirNota(review.rating);
      campo.comentario.value = review.comment;
      campo.nome.value = review.name;
      mostrarErro(t("reviews.loaded"), "info");
    } catch {}
  }

  async function abrir({ rascunho = false } = {}) {
    mostrarErro("");
    if (!rascunho) {
      form.reset();
      definirNota(0);
      Object.assign(estado, { ticket: null, provedor: "anonymous", anterior: null, foto: "keep", previa: null });
      const apoiador = ler(CHAVE_APOIADOR);
      if (apoiador?.code) {
        campo.codigo.value = apoiador.code;
        await carregarMinha(apoiador.code);
      }
    }
    if (!campo.nome.value) campo.nome.value = t("reviews.nameDefault");
    contar();
    mostrarQuem();
    mostrarAvatar();
    if (!dialogo.open) dialogo.showModal();
  }

  $("avaliacoes-escrever").addEventListener("click", () => abrir());
  // Código digitado à mão: traz a avaliação anterior desse código, se houver
  campo.codigo.addEventListener("change", async () => {
    const codigo = campo.codigo.value.trim();
    if (!codigo || estado.anterior || estado.ticket) return;
    await carregarMinha(codigo);
    mostrarQuem();
    mostrarAvatar();
    contar();
  });
  $("avaliacao-cancelar").addEventListener("click", () => dialogo.close());

  // Login: guarda o que foi escrito e vai ao provedor
  $("avaliacao-logins").addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-provedor]");
    if (!botao) return;
    guardarRascunho();
    location.href = `/api/reviews/auth/${botao.dataset.provedor}?lang=${encodeURIComponent(idioma)}`;
  });
  $("avaliacao-sem-login").addEventListener("click", () => {
    estado.ticket = null;
    estado.provedor = "anonymous";
    mostrarQuem();
  });

  // Foto: recortada no meio, num quadrado, e salva como JPEG
  campo.arquivo.addEventListener("change", async () => {
    const arquivo = campo.arquivo.files?.[0];
    campo.arquivo.value = "";
    if (!arquivo) return;
    mostrarErro("");
    try {
      if (arquivo.size > 15 * 1024 * 1024) throw new Error("grande");
      const imagem = await createImageBitmap(arquivo);
      const lado = Math.min(imagem.width, imagem.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(LADO_FOTO, lado);
      canvas
        .getContext("2d")
        .drawImage(imagem, (imagem.width - lado) / 2, (imagem.height - lado) / 2, lado, lado, 0, 0, canvas.width, canvas.height);
      imagem.close?.();
      estado.foto = estado.previa = canvas.toDataURL("image/jpeg", 0.88);
    } catch {
      mostrarErro(t("reviews.err.bad_image"));
    }
    mostrarAvatar();
  });
  $("avaliacao-tirar-foto").addEventListener("click", () => {
    estado.foto = null;
    estado.previa = null;
    mostrarAvatar();
  });

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const nota = notaEscolhida();
    const comentario = campo.comentario.value.trim();
    const nome = campo.nome.value.trim();
    // Conferência rápida aqui; o servidor confere tudo de novo
    const falta =
      (!campo.codigo.value.trim() && ["reviews.err.not_supporter", campo.codigo]) ||
      (!nota && ["reviews.err.bad_rating", estrelas.querySelector("input")]) ||
      (comentario.length < config.minComment && ["reviews.err.too_short", campo.comentario]) ||
      (!nome && ["reviews.err.no_name", campo.nome]) ||
      (!campo.consentimento.checked && ["reviews.err.consent", campo.consentimento]);
    if (falta) {
      mostrarErro(t(falta[0], { min: config.minComment, max: config.maxComment }));
      falta[1].focus();
      return;
    }
    mostrarErro("");
    enviar.disabled = true;
    enviar.textContent = t("reviews.sending");
    try {
      const resposta = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: campo.codigo.value.trim(),
          rating: nota,
          comment: comentario,
          name: nome,
          consent: true,
          lang: idioma,
          photo: estado.foto,
          ticket: estado.ticket,
          provider: estado.provedor,
          website: campo.isca.value,
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        const codigo = resposta.status === 429 ? "too_many" : resposta.status === 413 ? "bad_image" : corpo.error;
        const chave = `reviews.err.${codigo}`;
        mostrarErro(t(chave in textos ? chave : "reviews.err.generic", { min: config.minComment, max: config.maxComment }));
        if (codigo === "login_expired") {
          estado.ticket = null;
          estado.provedor = "anonymous";
          mostrarQuem();
        }
        return;
      }
      dialogo.close();
      $("avaliacoes-situacao").textContent = t(corpo.status === "edit_pending" ? "reviews.editSent" : "reviews.sent");
    } catch {
      mostrarErro(t("reviews.err.generic"));
    } finally {
      enviar.disabled = false;
      enviar.textContent = t("reviews.send");
    }
  });

  // ── Começo ─────────────────────────────────────────────────────────────
  (async () => {
    try {
      const resposta = await fetch("/api/reviews/config");
      config = { ...config, ...(await resposta.json()) };
    } catch {
      return;
    }
    if (!config.enabled) return;
    secao.hidden = false;
    carregarLista();

    // Volta do login (#review-ticket=… ou #review-error=…) ou link #avaliar
    const hash = HASH_INICIAL;
    const ticket = /^#review-ticket=([\w-]+)$/.exec(hash)?.[1];
    const falhou = /^#review-error=(\w+)$/.test(hash);
    if (ticket || falhou) {
      // Sem rascunho (outra aba, armazenamento bloqueado): ao menos o código
      if (!recuperarRascunho()) campo.codigo.value = ler(CHAVE_APOIADOR)?.code || "";
      if (ticket) {
        try {
          const resposta = await fetch("/api/reviews/identity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket }),
          });
          if (!resposta.ok) throw new Error("expirou");
          const id = await resposta.json();
          estado.ticket = ticket;
          estado.provedor = id.provider;
          if (id.name) campo.nome.value = id.name;
          // A foto do provedor só entra se a pessoa não escolheu outra
          if (id.photo && !(typeof estado.foto === "string" && estado.foto.startsWith("data:"))) {
            estado.foto = "keep";
            estado.previa = id.photo;
          }
        } catch {
          await abrir({ rascunho: true });
          mostrarErro(t("reviews.err.login_expired"));
          return;
        }
      }
      await abrir({ rascunho: true });
      if (falhou) mostrarErro(t("reviews.err.login"));
      secao.scrollIntoView();
    } else if (hash === "#avaliar") {
      // Link "Avaliar o Icon Library" da janela do café ou de Meus ícones
      secao.scrollIntoView();
      abrir();
    }
  })();
}
