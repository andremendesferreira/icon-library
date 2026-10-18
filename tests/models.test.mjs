// Regras do site que não dependem do navegador: transformações de SVG,
// filtros, escape de HTML, scratchpad e versões fixas dos pacotes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ESTILO_PADRAO,
  aplicarEstilo,
  nomeDeArquivo,
  nomeDeComponente,
  paraReact,
} from "../public/js/models/svgTools.js";
import {
  IconModel,
  linkDoStudio,
  svgDoItem,
} from "../public/js/models/IconModel.js";
import { ScratchpadModel } from "../public/js/models/ScratchpadModel.js";
import { FONTES, VERSOES } from "../public/js/models/iconSets.js";
import { escapar } from "../public/js/views/html.js";

const TRACO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><circle cx="12" cy="12" r="3"/></svg>';
const PREENCHIDO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 0z"/></svg>';

test("aplicarEstilo: padrão não muda nada", () => {
  assert.equal(aplicarEstilo(TRACO, ESTILO_PADRAO), TRACO);
});

test("aplicarEstilo: tamanho, traço e cor só na tag de fora", () => {
  const svg = aplicarEstilo(TRACO, { tamanho: 48, traco: 1.5, cor: "#ff0000" });
  assert.match(svg, /^<svg[^>]* width="48" height="48"/);
  assert.match(svg, /stroke-width="1.5"/);
  assert.match(svg, /stroke="#ff0000"/);
  assert.doesNotMatch(svg, /currentColor/);
  // O círculo interno continua com seus atributos
  assert.match(svg, /<circle cx="12" cy="12" r="3"\/>/);
});

test("aplicarEstilo: ícone preenchido ganha cor e tamanho, sem traço", () => {
  const svg = aplicarEstilo(PREENCHIDO, { tamanho: 16, traco: 3, cor: "#00aa00" });
  assert.match(svg, /width="16" height="16"/);
  assert.match(svg, /fill="#00aa00"/);
  assert.doesNotMatch(svg, /stroke-width/);
});

test("nomeDeComponente: PascalCase e nunca começa com número", () => {
  assert.equal(nomeDeComponente("arrow up right"), "ArrowUpRightIcon");
  assert.equal(nomeDeComponente("1st place medal"), "Icon1stPlaceMedalIcon");
  assert.equal(nomeDeComponente("x"), "XIcon");
});

test("paraReact: atributos em camelCase e props no <svg>", () => {
  const react = paraReact(PREENCHIDO, "check");
  assert.match(react, /^export function CheckIcon\(props\) \{/);
  assert.match(react, /fillRule="evenodd"/);
  assert.match(react, /<svg [^>]*\{\.\.\.props\}>/);
  assert.doesNotMatch(react, /fill-rule/);
});

test("nomeDeArquivo: minúsculas e hífens", () => {
  assert.equal(nomeDeArquivo("Arrow Up / Right"), "arrow-up-right");
  assert.equal(nomeDeArquivo("???"), "icon");
});

test("escapar: nada vira marcação nem fecha atributo", () => {
  assert.equal(
    escapar(`<img src=x onerror="alert('1')">&`),
    "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
  );
});

test("svgDoItem: emoji vira <text> dentro de um SVG", () => {
  assert.equal(svgDoItem({ tipo: "svg", svg: TRACO }), TRACO);
  assert.match(svgDoItem({ tipo: "emoji", char: "😀" }), /<text[^>]*>😀<\/text>/);
});

test("linkDoStudio: só para editáveis, com o SVG interno na URL", () => {
  assert.equal(linkDoStudio({ tipo: "svg", svg: TRACO }), null);
  const link = new URL(linkDoStudio({ tipo: "svg", svg: TRACO, editavel: true, nome: "loader" }));
  assert.equal(link.origin + link.pathname, "https://studio.lucide.dev/edit");
  assert.equal(link.searchParams.get("name"), "loader");
  assert.equal(link.searchParams.get("value"), '<path d="M12 2v4"/><circle cx="12" cy="12" r="3"/>');
});

function modeloCom(itens, fonte = { rotuloGrupo: "All categories" }) {
  const modelo = new IconModel();
  modelo.exibir("teste", { itens, usouAlternativa: false });
  modelo.fonteExibida = fonte;
  return modelo;
}

test("IconModel: busca, categorias e 'others' por último", () => {
  const modelo = modeloCom([
    { nome: "heart", grupo: "shapes", suportado: true },
    { nome: "home", grupo: "others", suportado: true },
    { nome: "arrow", grupo: "arrows", suportado: true },
  ]);
  assert.deepEqual(
    modelo.contarGrupos().map(([grupo]) => grupo),
    ["arrows", "shapes", "others"],
  );
  const busca = modelo.filtrar({ busca: "H", apenasSuportados: false });
  assert.deepEqual(busca.map(([grupo]) => grupo), ["shapes", "others"]);

  modelo.alternarGrupo("shapes", true);
  const filtrado = modelo.filtrar({ busca: "", apenasSuportados: false });
  assert.deepEqual(filtrado.map(([grupo, itens]) => [grupo, itens.length]), [["shapes", 1]]);
});

test("IconModel: 'só com desenho' vale apenas para emoji", () => {
  const itens = [
    { nome: "a", grupo: "g", suportado: true },
    { nome: "b", grupo: "g", suportado: false },
  ];
  const vetor = modeloCom(itens);
  assert.equal(vetor.filtrar({ busca: "", apenasSuportados: true })[0][1].length, 2);
  const emoji = modeloCom(itens, { rotuloGrupo: "x", detectaGlifo: true });
  assert.equal(emoji.filtrar({ busca: "", apenasSuportados: true })[0][1].length, 1);
});

test("IconModel: svgFinal aplica o estilo escolhido", () => {
  const modelo = new IconModel();
  modelo.definirEstilo({ tamanho: 32, cor: "#123456" });
  const svg = modelo.svgFinal({ tipo: "svg", svg: TRACO });
  assert.match(svg, /width="32"/);
  assert.match(svg, /stroke="#123456"/);
  modelo.restaurarEstilo();
  assert.deepEqual(modelo.estilo, ESTILO_PADRAO);
});

test("ScratchpadModel: comentário com o nome e SVG na linha de baixo", () => {
  const scratchpad = new ScratchpadModel();
  scratchpad.adicionar("eye", "<svg>1</svg>");
  scratchpad.adicionar("heart", "<svg>2</svg>");
  assert.equal(
    scratchpad.texto,
    "<!-- eye -->\n<svg>1</svg>\n\n<!-- heart -->\n<svg>2</svg>\n",
  );
  scratchpad.limpar();
  assert.equal(scratchpad.texto, "");
});

test("Versões: fixas no site e iguais no gerador de categorias", () => {
  const urls = JSON.stringify(
    Object.values(FONTES).map((fonte) => fonte.url),
  );
  for (const [chave, versao] of Object.entries(VERSOES))
    assert.ok(urls.includes(`@${versao}/`), `${chave} sem versão ${versao}`);
  assert.doesNotMatch(urls, /unpkg\.com\/[a-z-]+\//, "pacote do unpkg sem versão");

  const gerador = readFileSync(
    new URL("../scripts/generate-icon-categories.js", import.meta.url),
    "utf8",
  );
  assert.ok(gerador.includes(`feather-icons@${VERSOES.feather}/`));
  assert.ok(gerador.includes(`bootstrap-icons@${VERSOES.bootstrap}/`));
});
