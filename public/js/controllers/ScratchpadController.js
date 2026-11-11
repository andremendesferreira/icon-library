import { copiarTexto } from "./clipboard.js";
import { t, tErro } from "../i18n/i18n.js";
import { EditorModel } from "../models/EditorModel.js";

// Um arquivo .svg maior que isso não é um ícone
const TAMANHO_MAXIMO_SVG = 512 * 1024;

// SVG de fora (arquivo enviado, texto digitado) passa pela mesma limpeza do
// editor antes de ir para a tela ou para o texto. Lança erro se não for SVG.
function limparSvg(texto) {
  const editor = new EditorModel();
  editor.carregar(texto);
  return editor.svg();
}

export class ScratchpadController {
  // abrirNoEditor(nome, svg, salvar): abre o ícone no editor; salvar(svgNovo)
  // troca o ícone no lugar e devolve se achou
  constructor(model, view, avisar, { abrirNoEditor } = {}) {
    this.model = model;
    this.view = view;
    this.avisar = avisar;
    this.abrirNoEditor = abrirNoEditor;
  }

  iniciar() {
    const { model, view } = this;
    view.mostrarTexto(model.texto);
    this.mostrarIcones();
    view.aoAlternar(() => view.abrir(!view.aberto, { focar: true }));
    view.aoFechar(() => view.abrir(false));
    // Digitar atualiza a grade depois de uma pausa
    let espera;
    view.aoEditar((texto) => {
      model.definir(texto);
      clearTimeout(espera);
      espera = setTimeout(() => this.mostrarIcones(), 300);
    });
    view.aoLimpar(() => {
      model.limpar();
      view.mostrarTexto("");
      this.mostrarIcones();
      view.focar();
    });
    view.aoAbrirIcone((i) => this.editarIcone(i));
    view.aoEnviarArquivos((arquivos) => this.enviarArquivos(arquivos));
    view.aoCopiar(() => {
      if (!model.texto.trim()) return this.avisar(t("scratchpad.empty"));
      copiarTexto(model.texto).then(
        () => this.avisar(t("scratchpad.copied")),
        () => this.avisar(t("toast.copyBlocked")),
      );
    });
  }

  // Botão "+" de um card: acrescenta o ícone (svg já com tamanho, traço e cor
  // escolhidos) e abre a gaveta se estiver fechada
  adicionar(item, svg) {
    this.model.adicionar(item.nome, svg);
    this.view.mostrarTexto(this.model.texto, { rolarAoFim: true });
    this.mostrarIcones();
    if (!this.view.aberto) this.view.abrir(true);
    this.avisar(t("scratchpad.added", { name: item.nome }));
  }

  // Grade com os ícones achados no texto; um SVG quebrado não entra
  mostrarIcones() {
    const icones = [];
    this.entradas = [];
    for (const entrada of this.model.entradas) {
      try {
        icones.push({ nome: entrada.nome, svg: limparSvg(entrada.svg) });
        this.entradas.push(entrada);
      } catch {
        // Ainda sendo digitado, ou não é SVG: fica só no texto
      }
    }
    this.view.mostrarIcones(icones);
  }

  // Clique num ícone da grade: abre no editor, e "Salvar no scratchpad" troca
  // aquele ícone no lugar. Se ele sumiu do texto nesse meio-tempo, entra no fim.
  editarIcone(i) {
    const entrada = this.entradas?.[i];
    if (!entrada || !this.abrirNoEditor) return;
    const nome = entrada.nome || t("scratchpad.unnamed");
    let original = entrada.svg;
    let posicao = entrada.inicio;
    this.abrirNoEditor(nome, entrada.svg, (novo) => {
      if (this.model.substituir(original, novo, posicao)) {
        original = novo;
        this.avisar(t("scratchpad.saved", { name: nome }));
      } else {
        this.model.adicionar(nome, novo);
        this.avisar(t("scratchpad.savedAsNew", { name: nome }));
      }
      this.view.mostrarTexto(this.model.texto);
      this.mostrarIcones();
    });
  }

  // Um aviso só no fim: os de erro não somem atrás do de sucesso
  async enviarArquivos(arquivos) {
    let enviados = 0;
    const erros = [];
    for (const arquivo of arquivos) {
      const nome = arquivo.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").trim() || "icon";
      try {
        if (!/\.svg$/i.test(arquivo.name) && arquivo.type !== "image/svg+xml") throw new Error(t("scratchpad.notSvg", { file: arquivo.name }));
        if (arquivo.size > TAMANHO_MAXIMO_SVG) throw new Error(t("scratchpad.tooLarge", { file: arquivo.name }));
        let svg;
        try {
          svg = limparSvg(await arquivo.text());
        } catch {
          // O erro do leitor de XML é longo e técnico: o aviso diz só o arquivo
          throw new Error(t("scratchpad.notSvg", { file: arquivo.name }));
        }
        this.model.adicionar(nome, svg);
        enviados++;
      } catch (erro) {
        // Os erros de leitura do SVG não dizem de qual arquivo vieram
        const texto = tErro(erro);
        erros.push(texto.includes(arquivo.name) ? texto : `${arquivo.name}: ${texto}`);
      }
    }
    if (enviados) {
      this.view.mostrarTexto(this.model.texto, { rolarAoFim: true });
      this.mostrarIcones();
      if (!this.view.aberto) this.view.abrir(true);
    }
    const resumo = enviados ? [t("scratchpad.uploaded", { n: enviados }), ...erros] : erros;
    if (resumo.length) this.avisar(resumo.join(" · "));
  }
}
