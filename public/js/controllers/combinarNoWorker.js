// Unir, Subtrair, Interseção e Excluir num Web Worker
// (js/workers/booleanas.worker.js), com tempo-limite: uma forma muito
// auto-intersectante vinda de um link ou de um .ile pode levar minutos no
// Paper.js, e na página isso congelaria a aba. Passado o limite, o worker é
// encerrado e a promessa falha com codigo "tempo". O worker (e o Paper.js) só
// são baixados no primeiro uso.
const ENDERECO = "js/workers/booleanas.worker.js";
const LIMITE = 4000;

let worker = null;
let sequencia = 0;
const pendentes = new Map();

function falhar(codigo, mensagem) {
  return Object.assign(new Error(mensagem), { codigo });
}

function encerrar(motivo) {
  worker?.terminate();
  worker = null;
  for (const [, pedido] of pendentes) {
    clearTimeout(pedido.relogio);
    pedido.rejeitar(motivo);
  }
  pendentes.clear();
}

function criar() {
  worker = new Worker(ENDERECO);
  worker.onmessage = ({ data }) => {
    const pedido = pendentes.get(data?.id);
    if (!pedido) return;
    pendentes.delete(data.id);
    clearTimeout(pedido.relogio);
    if (typeof data.d === "string") pedido.resolver(data.d);
    else pedido.rejeitar(falhar("erro", data.erro || "falhou"));
  };
  // O script não carregou (rede, arquivo faltando): na próxima, tenta de novo
  worker.onerror = (evento) => {
    evento.preventDefault?.();
    encerrar(falhar("carga", "o worker não carregou"));
  };
}

// Já foi usado nesta página (para o aviso "Carregando…" só na primeira vez)
export const workerPronto = () => worker !== null;

export function combinarNoWorker(operacao, caminhos, { limite = LIMITE } = {}) {
  if (!worker) criar();
  const id = ++sequencia;
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => {
      pendentes.delete(id);
      // Encerrar é o único jeito de parar uma conta que não termina
      encerrar(falhar("tempo", "demorou demais"));
      rejeitar(falhar("tempo", "demorou demais"));
    }, limite);
    pendentes.set(id, { resolver, rejeitar, relogio });
    worker.postMessage({ id, operacao, caminhos });
  });
}
