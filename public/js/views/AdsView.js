const SCRIPT = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);

// Áreas de publicidade (elementos [data-ad] do index.html). O CSS decide quais
// aparecem em cada tamanho de tela; aqui só se pede anúncio para as visíveis —
// o AdSense rejeita blocos sem largura.
export class AdsView {
  constructor(config) {
    this.config = config;
    this.areas = [...document.querySelectorAll("[data-ad]")];
  }

  iniciar() {
    const { cliente, slots } = this.config;
    // Sem ID de editor: nada em produção, só a prévia das áreas em localhost
    if (!cliente) {
      if (LOCAL) for (const area of this.areas) this.mostrarPrevia(area);
      return;
    }

    this.areas = this.areas.filter((area) => slots[area.dataset.ad]);
    if (!this.areas.length) return;
    for (const area of this.areas) area.hidden = false;

    const script = document.createElement("script");
    script.async = true;
    script.src = `${SCRIPT}?client=${cliente}`;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);

    this.preencherVisiveis();
    // Ao cruzar o ponto de troca entre laterais e faixa, preenche as que surgiram
    window.addEventListener("resize", () => this.preencherVisiveis());
  }

  mostrarPrevia(area) {
    area.hidden = false;
    area.classList.add("ad--preview");
    area.querySelector(".ad__unit").textContent = `Ad preview · ${area.dataset.ad}`;
  }

  preencherVisiveis() {
    for (const area of this.areas) {
      if (area.dataset.adFilled || !area.offsetWidth) continue;
      area.dataset.adFilled = "true";
      area.querySelector(".ad__unit").appendChild(this.criarBloco(area));
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  }

  criarBloco(area) {
    const bloco = document.createElement("ins");
    bloco.className = "adsbygoogle";
    bloco.dataset.adClient = this.config.cliente;
    bloco.dataset.adSlot = this.config.slots[area.dataset.ad];
    if (area.classList.contains("ad--rail")) {
      // Tamanho fixo: o mesmo reservado pelo CSS
      bloco.style.cssText = "display:inline-block;width:160px;height:600px";
    } else {
      bloco.style.display = "block";
      bloco.dataset.adFormat = "horizontal";
      bloco.dataset.fullWidthResponsive = "true";
    }
    return bloco;
  }
}
