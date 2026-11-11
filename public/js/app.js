import { carregarIdioma, traduzirPagina } from "./i18n/i18n.js";
import { IconModel } from "./models/IconModel.js";
import { IconView } from "./views/IconView.js";
import { IconController } from "./controllers/IconController.js";
import { ScratchpadModel } from "./models/ScratchpadModel.js";
import { ScratchpadView } from "./views/ScratchpadView.js";
import { ScratchpadController } from "./controllers/ScratchpadController.js";
import { EditorModel } from "./models/EditorModel.js";
import { EditorView } from "./views/EditorView.js";
import { EditorController } from "./controllers/EditorController.js";
import { ADS } from "./models/adsConfig.js";
import { AdsView } from "./views/AdsView.js";
import { SupporterModel } from "./models/SupporterModel.js";
import { CoffeeView } from "./views/CoffeeView.js";
import { CoffeeController } from "./controllers/CoffeeController.js";
import { PublishView } from "./views/PublishView.js";
import { PublishController } from "./controllers/PublishController.js";
import { ReportView } from "./views/ReportView.js";
import { ReportController } from "./controllers/ReportController.js";
import { PngView } from "./views/PngView.js";
import { MineView } from "./views/MineView.js";
import { MineController } from "./controllers/MineController.js";

// O idioma vem antes de tudo: as views já nascem com os textos traduzidos
await carregarIdioma();
traduzirPagina();

const iconModel = new IconModel();
const iconView = new IconView();
const avisar = (mensagem, acao) => iconView.mostrarToast(mensagem, acao);

// Os ícones da página, para o editor pôr um segundo ícone por cima.
// Só os conjuntos vetoriais (emoji é texto, não tem formas para editar).
const LIMITE_BUSCA = 60;
const catalogo = {
  conjuntos: () =>
    Object.entries(iconModel.fontes)
      .filter(([, fonte]) => !fonte.detectaGlifo)
      .map(([chave, fonte]) => ({ chave, rotulo: fonte.rotulo })),
  atual: () =>
    iconModel.fontes[iconModel.fonteAtual]?.detectaGlifo ? null : iconModel.fonteAtual,
  rotulo: (chave) => iconModel.fontes[chave]?.rotulo ?? chave,
  async buscar(chave, termo) {
    const { itens } = await iconModel.carregar(chave);
    const busca = termo.trim().toLowerCase();
    return itens
      .filter(
        (item) =>
          !busca ||
          item.nome.toLowerCase().includes(busca) ||
          item.tags?.some((tag) => tag.toLowerCase().includes(busca)),
      )
      .slice(0, LIMITE_BUSCA);
  },
  svg: (item) => iconModel.svgFinal(item),
};

// O editor é criado depois; a grade do scratchpad só o chama num clique
let editor;
const scratchpad = new ScratchpadController(
  new ScratchpadModel(),
  new ScratchpadView(),
  avisar,
  { abrirNoEditor: (nome, svg, salvar) => editor.abrirDoScratchpad(nome, svg, salvar) },
);
scratchpad.iniciar();

// Janela "Baixar PNG" (tamanho), usada pelos cards e pelo editor
const pngView = new PngView();
const escolherTamanhoPng = (sugerido) => pngView.abrir(sugerido);

editor = new EditorController(new EditorModel(), new EditorView(), {
  avisar,
  escolherTamanhoPng,
  aoAdicionar: (item, svg) => scratchpad.adicionar(item, svg),
  catalogo,
});
editor.iniciar();

// Café antes dos anúncios: quem acabou de pagar (volta do Stripe com
// ?coffee=…) já não os vê, e o endereço fica limpo para a busca
const apoiador = new SupporterModel();
const anuncios = new AdsView(ADS);
const cafeView = new CoffeeView();
await new CoffeeController(apoiador, cafeView, {
  avisar,
  aoApoiar: () => anuncios.desligar(),
}).iniciar();

// Publicar o ícone do editor na Iconlibrary (só apoiadores)
new PublishController(new PublishView(), {
  icone: () => editor.atual(),
  apoiador,
  abrirCafe: () => cafeView.abrir(),
  avisar,
}).iniciar();

// "Meus ícones": o autor edita o que publicou e envia para nova revisão
new MineController(new MineView(), {
  apoiador,
  aoEditar: (dados) => editor.abrirEdicao(dados),
});

// "Reportar bug" no rodapé
new ReportController(new ReportView(), { avisar }).iniciar();

new IconController(iconModel, iconView, {
  aoAdicionar: (item, svg) => scratchpad.adicionar(item, svg),
  aoEditar: (item, svg) => editor.abrir(item, svg),
  escolherTamanhoPng,
}).iniciar();
if (apoiador.ativo()) anuncios.desligar();
else anuncios.iniciar();
