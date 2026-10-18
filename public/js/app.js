import { IconModel } from "./models/IconModel.js";
import { IconView } from "./views/IconView.js";
import { IconController } from "./controllers/IconController.js";
import { ScratchpadModel } from "./models/ScratchpadModel.js";
import { ScratchpadView } from "./views/ScratchpadView.js";
import { ScratchpadController } from "./controllers/ScratchpadController.js";
import { ADS } from "./models/adsConfig.js";
import { AdsView } from "./views/AdsView.js";

const iconView = new IconView();
const scratchpad = new ScratchpadController(
  new ScratchpadModel(),
  new ScratchpadView(),
  (mensagem) => iconView.mostrarToast(mensagem),
);
scratchpad.iniciar();

new IconController(new IconModel(), iconView, {
  aoAdicionar: (item, svg) => scratchpad.adicionar(item, svg),
}).iniciar();
new AdsView(ADS).iniciar();
