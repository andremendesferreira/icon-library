// Descobre se a fonte do sistema consegue desenhar cada caractere: desenha-o
// num canvas e vê se sobrou algum pixel (um texto vazio ou um espaço não
// deixa nenhum).
//
// Todos de uma vez, cada um na sua célula de uma grade: ler os pixels do canvas
// (getImageData) obriga o navegador a esperar a placa de vídeo, e uma leitura
// por emoji (quase 2.000) levava vários segundos para abrir ?set=emoji. Agora
// é uma leitura por lote. Mesmo assim, desenhar cada emoji custa (milissegundos
// por emoji num aparelho sem placa de vídeo), então a página não espera:
// detectarGlifos roda num Web Worker (js/workers/glifos.worker.js) e guarda o
// resultado no navegador para as próximas visitas.
const CELULA = 24;
const COLUNAS = 64;
const LOTE = COLUNAS * 32;

// criarCanvas: no worker, um OffscreenCanvas
export function temGlifos(chars, criarCanvas = () => document.createElement("canvas")) {
  const lista = [...chars];
  const resultado = new Array(lista.length).fill(false);
  if (!lista.length) return resultado;
  const canvas = criarCanvas();
  canvas.width = COLUNAS * CELULA;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  for (let inicio = 0; inicio < lista.length; inicio += LOTE) {
    const lote = lista.slice(inicio, inicio + LOTE);
    const linhas = Math.ceil(lote.length / COLUNAS);
    // Mudar o tamanho limpa o canvas e desfaz a fonte: reconfigura a cada lote
    canvas.height = linhas * CELULA;
    ctx.font = "18px sans-serif";
    ctx.textBaseline = "top";
    lote.forEach((char, i) => {
      const x = (i % COLUNAS) * CELULA;
      const y = Math.floor(i / COLUNAS) * CELULA;
      // Uma sequência que a fonte não junta vira vários desenhos lado a lado:
      // o recorte impede que invada a célula vizinha
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, CELULA, CELULA);
      ctx.clip();
      ctx.fillText(char, x, y);
      ctx.restore();
    });
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    lote.forEach((_, i) => {
      const x0 = (i % COLUNAS) * CELULA;
      const y0 = Math.floor(i / COLUNAS) * CELULA;
      for (let y = y0; y < y0 + CELULA && !resultado[inicio + i]; y++) {
        const base = (y * canvas.width + x0) * 4;
        for (let p = base + 3; p < base + CELULA * 4; p += 4)
          if (pixels[p] !== 0) {
            resultado[inicio + i] = true;
            break;
          }
      }
    });
  }
  return resultado;
}

// Resultado guardado: só os caracteres SEM desenho, válido para este navegador
// (o user agent muda quando o navegador ou o sistema atualiza, e com ele as
// fontes) e esta versão da lista de emojis
const CHAVE = "icon-library:emoji-glyphs";
const ENDERECO = "js/workers/glifos.worker.js";
const LIMITE = 60000;

function lerGuardado(versao) {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE));
    if (dados?.versao === versao && dados.navegador === navigator.userAgent && Array.isArray(dados.faltam))
      return new Set(dados.faltam);
  } catch {}
  return null;
}

function guardar(versao, faltam) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ versao, navegador: navigator.userAgent, faltam }));
  } catch {}
}

// No worker; sem OffscreenCanvas, sem worker ou se ele falhar, na página
function noWorker(chars) {
  return new Promise((resolver, rejeitar) => {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return rejeitar(new Error("sem worker"));
    const worker = new Worker(ENDERECO, { type: "module" });
    const fim = (acao, valor) => {
      clearTimeout(relogio);
      worker.terminate();
      acao(valor);
    };
    const relogio = setTimeout(() => fim(rejeitar, new Error("tempo")), LIMITE);
    worker.onmessage = ({ data }) =>
      Array.isArray(data?.desenhados) ? fim(resolver, data.desenhados) : fim(rejeitar, new Error(data?.erro || "falhou"));
    worker.onerror = (evento) => {
      evento.preventDefault?.();
      fim(rejeitar, new Error("o worker não carregou"));
    };
    worker.postMessage({ chars });
  });
}

// Os caracteres sem desenho guardados numa visita anterior (Set), ou null
// quando não há resultado válido: aí detectarGlifos faz o trabalho e guarda
export function glifosGuardados(versao) {
  return lerGuardado(versao);
}

export async function detectarGlifos(chars, versao) {
  let desenhados;
  try {
    desenhados = await noWorker(chars);
  } catch {
    desenhados = temGlifos(chars);
  }
  const faltam = chars.filter((_, i) => !desenhados[i]);
  guardar(versao, faltam);
  return new Set(faltam);
}
