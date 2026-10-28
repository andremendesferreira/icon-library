import { escapar } from "./html.js";
import { t } from "../i18n/i18n.js";
import { fecharAoClicarFora } from "./dialogo.js";

const porId = (id) => document.getElementById(id);

// Janela "Publicar na Iconlibrary": nome, categorias, crédito, código de
// apoiador e o aceite da licença MIT. Abre por cima do editor.
export class PublishView {
  janela = porId("publish");
  botao = porId("editor-publish");
  formulario = porId("publish-form");
  previa = porId("publish-preview");
  nome = porId("publish-name");
  categorias = porId("publish-categories");
  rotuloCategorias = porId("publish-categories-label");
  autor = porId("publish-author");
  codigo = porId("publish-code");
  licenca = porId("publish-license");
  enviar = porId("publish-send");
  situacao = porId("publish-status");
  aviso = porId("publish-supporters");
  maximo = 3;

  constructor() {
    porId("publish-close").addEventListener("click", () => this.janela.close());
    fecharAoClicarFora(this.janela);
    // No máximo N categorias: as demais caixas ficam desativadas
    this.categorias.addEventListener("change", () => this.limitarCategorias());
  }

  mostrarBotao(visivel) {
    this.botao.hidden = !visivel;
  }

  aoAbrir(acao) {
    this.botao.addEventListener("click", acao);
  }

  aoEnviar(acao) {
    this.formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      acao({
        name: this.nome.value,
        categories: [...this.categorias.querySelectorAll("input:checked")].map((c) => c.value),
        author: this.autor.value,
        code: this.codigo.value.trim(),
        license: this.licenca.checked ? "MIT" : undefined,
      });
    });
  }

  aoPagarCafe(acao) {
    porId("publish-coffee").addEventListener("click", () => {
      this.janela.close();
      acao();
    });
  }

  // lista: todas as categorias; maximo: quantas podem ser marcadas
  preparar(lista, maximo) {
    this.maximo = maximo;
    this.rotuloCategorias.textContent = t("publish.categories", { n: maximo });
    if (this.categorias.childElementCount) return;
    this.categorias.innerHTML = lista
      .map(
        (categoria) =>
          `<label class="publish__category"><input type="checkbox" value="${escapar(categoria)}" /> ${escapar(categoria)}</label>`,
      )
      .join("");
  }

  limitarCategorias() {
    const caixas = [...this.categorias.querySelectorAll("input")];
    const marcadas = caixas.filter((c) => c.checked).length;
    for (const caixa of caixas) caixa.disabled = !caixa.checked && marcadas >= this.maximo;
  }

  // svg: o ícone do editor; nome sugerido; codigo: o do apoiador, se houver.
  // Editando um ícone já publicado (edicao): título e botão de "edição", com
  // as categorias e o crédito dele já preenchidos.
  abrir({ svg, nome, codigo, categorias = [], autor = "", edicao = false }) {
    this.previa.innerHTML = svg;
    this.nome.value = nome || "";
    this.codigo.value = codigo || "";
    this.aviso.hidden = Boolean(codigo);
    this.licenca.checked = false;
    porId("publish-title").textContent = t(edicao ? "publish.titleEdit" : "publish.title");
    this.enviar.textContent = t(edicao ? "publish.sendEdit" : "publish.send");
    if (edicao) {
      this.autor.value = autor || "";
      for (const caixa of this.categorias.querySelectorAll("input")) caixa.checked = categorias.includes(caixa.value);
      this.limitarCategorias();
    }
    this.mostrarSituacao("");
    this.travar(false);
    if (!this.janela.open) this.janela.showModal();
    this.nome.focus();
  }

  fechar() {
    this.janela.close();
  }

  travar(enviando) {
    this.enviar.disabled = enviando;
  }

  mostrarSituacao(mensagem, tipo = "info") {
    this.situacao.textContent = mensagem;
    this.situacao.dataset.tipo = tipo;
  }
}
