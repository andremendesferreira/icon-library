// Unir, Subtrair, Interseção e Excluir entre formas fechadas, com o Paper.js
// (public/js/vendor/paper-core.min.js, MIT), que mantém as curvas.
//
// A lógica está em booleanasNucleo.js, um script comum que também roda no Web
// Worker da página (js/workers/booleanas.worker.js); aqui ela é reexportada
// para os testes, que passam o paper do pacote npm. Sem DOM.
import "./booleanasNucleo.js";

export const { OPERACOES, combinarCaminhos } = globalThis.IconLibraryBooleanas;
