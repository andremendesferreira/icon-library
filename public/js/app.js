import { IconModel } from "./models/IconModel.js";
import { IconView } from "./views/IconView.js";
import { IconController } from "./controllers/IconController.js";
import { ADS } from "./models/adsConfig.js";
import { AdsView } from "./views/AdsView.js";

new IconController(new IconModel(), new IconView()).iniciar();
new AdsView(ADS).iniciar();
