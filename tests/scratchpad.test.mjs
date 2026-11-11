// Scratchpad: os ícones achados no texto (para a grade) e a troca de um
// ícone editado no mesmo lugar.
import { test } from "node:test";
import assert from "node:assert/strict";

import { entradasDoTexto, substituirNoTexto } from "../public/js/models/ScratchpadModel.js";

const A = '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>';
const B = '<svg viewBox="0 0 24 24"><circle r="2"/></svg>';

test("entradasDoTexto: nome do comentário, svg e posição; texto livre fica de fora", () => {
  const texto = `notas soltas\n<!-- heart -->\n${A}\n\n${B}\nmais texto`;
  const [a, b] = entradasDoTexto(texto);
  assert.deepEqual([a.nome, a.svg, b.nome, b.svg], ["heart", A, "", B]);
  assert.equal(texto.slice(a.inicio, a.fim), A);
  assert.equal(entradasDoTexto("<svg sem fim").length, 0);
});

test("substituirNoTexto: troca o SVG no lugar e mantém o comentário", () => {
  const texto = `<!-- um -->\n${A}\n\n<!-- dois -->\n${A}\n`;
  const segunda = entradasDoTexto(texto)[1].inicio;
  // Dois iguais: vale o mais perto da posição de quando foi aberto
  assert.equal(substituirNoTexto(texto, A, B, segunda), `<!-- um -->\n${A}\n\n<!-- dois -->\n${B}\n`);
  assert.equal(substituirNoTexto(texto, A, B, 0), `<!-- um -->\n${B}\n\n<!-- dois -->\n${A}\n`);
  // Sumiu do texto enquanto o editor estava aberto
  assert.equal(substituirNoTexto(texto, B, A, 0), null);
});
