// Carrega o Paper.js (public/js/vendor/paper-core.min.js, MIT, ~60 KB
// comprimido) só no primeiro uso de Unir, Subtrair, Interseção ou Excluir: quem
// não usa essas operações não baixa nada. O arquivo é servido pelo próprio
// site, na versão fixada em package.json (devDependencies, usada nos testes).
const ENDERECO = "js/vendor/paper-core.min.js";
let promessa = null;

export function carregarPaper() {
  if (globalThis.paper?.CompoundPath) return Promise.resolve(globalThis.paper);
  promessa ??= new Promise((resolver, rejeitar) => {
    const script = document.createElement("script");
    script.src = ENDERECO;
    script.async = true;
    script.onload = () => {
      const paper = globalThis.paper;
      if (!paper?.setup) return rejeitar(new Error("Paper.js não carregou"));
      // Um projeto sem tela: só para as contas de geometria
      paper.setup(new paper.Size(1, 1));
      resolver(paper);
    };
    script.onerror = () => {
      promessa = null;
      rejeitar(new Error("Paper.js não carregou"));
    };
    document.head.append(script);
  });
  return promessa;
}
