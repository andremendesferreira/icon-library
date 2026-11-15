// Detecta, fora da página, que emojis a fonte do aparelho desenha
// (models/glyphDetector.js): desenhar quase 2.000 emojis leva segundos num
// aparelho sem placa de vídeo, e na página isso travaria a abertura.
import { temGlifos } from "../models/glyphDetector.js";

self.onmessage = ({ data }) => {
  try {
    const chars = Array.isArray(data?.chars) ? data.chars.map(String) : [];
    self.postMessage({ desenhados: temGlifos(chars, () => new OffscreenCanvas(1, 1)) });
  } catch (erro) {
    self.postMessage({ erro: String(erro?.message || erro) });
  }
};
