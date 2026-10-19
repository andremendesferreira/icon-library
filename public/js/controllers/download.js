// Downloads gerados no navegador, sem passar pelo servidor.

function baixar(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Arquivo de texto com nome e extensão completos (ex.: "heart.ile")
export function baixarTexto(conteudo, nomeCompleto, tipo = "text/plain") {
  baixar(new Blob([conteudo], { type: `${tipo};charset=utf-8` }), nomeCompleto);
}

export function baixarSvg(svg, nomeArquivo) {
  baixar(new Blob([svg], { type: "image/svg+xml" }), `${nomeArquivo}.svg`);
}

function canvasParaPng(canvas, nomeArquivo) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("PNG not generated"));
      baixar(blob, `${nomeArquivo}.png`);
      resolve();
    }, "image/png"),
  );
}

// SVG vetorial → PNG do tamanho do próprio SVG. Numa imagem solta não existe
// "cor do texto", então currentColor vira a cor informada.
export function baixarPngDeSvg(svg, tamanho, corPadrao, nomeArquivo) {
  const solto = svg.replaceAll("currentColor", corPadrao);
  return new Promise((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = tamanho;
      canvas.getContext("2d").drawImage(imagem, 0, 0, tamanho, tamanho);
      canvasParaPng(canvas, nomeArquivo).then(resolve, reject);
    };
    imagem.onerror = () => reject(new Error("SVG could not be drawn"));
    imagem.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(solto);
  });
}

// Emoji → PNG: desenhado direto com a fonte do sistema (um SVG com <text>
// virando imagem nem sempre carrega a fonte de emoji)
export function baixarPngDeEmoji(char, tamanho, nomeArquivo) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext("2d");
  ctx.font = `${Math.round(tamanho * 0.85)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, tamanho / 2, tamanho / 2 + tamanho * 0.05);
  return canvasParaPng(canvas, nomeArquivo);
}
