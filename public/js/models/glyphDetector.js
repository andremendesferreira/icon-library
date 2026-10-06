// Descobre se a fonte do sistema consegue desenhar um caractere: desenha-o num
// canvas e compara com o resultado de um texto vazio e de um espaço.
export function criarDetector() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.font = "18px sans-serif";
  ctx.textBaseline = "top";

  const desenhar = (texto) => {
    ctx.clearRect(0, 0, 24, 24);
    ctx.fillText(texto, 0, 0);
    return ctx.getImageData(0, 0, 24, 24).data.join(",");
  };
  const vazio = desenhar("");
  const espaco = desenhar(" ");

  return (char) => {
    const pixels = desenhar(char);
    return pixels !== vazio && pixels !== espaco;
  };
}
