// Busca por nome e por palavra-chave (tags), contagem em outros conjuntos e o
// script que gera as tags do Feather e do Bootstrap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { IconModel } from "../public/js/models/IconModel.js";
import { FONTES } from "../public/js/models/iconSets.js";

const require = createRequire(import.meta.url);
const { lerTar, tagsDoCabecalho } = require("../scripts/generate-icon-tags.js");

const item = (nome, grupo, tags = []) => ({ nome, grupo, tags, tipo: "svg", suportado: true });

function modelo() {
  const model = new IconModel();
  model.exibir("lucide", {
    itens: [
      item("trash", "ui", ["garbage", "delete"]),
      item("x", "ui", ["close", "delete"]),
      item("delete", "ui"),
      item("house", "home", ["home"]),
    ],
    usouAlternativa: false,
  });
  return model;
}

test("filtrar: acha pelo nome e pela tag, com os do nome primeiro", () => {
  const model = modelo();
  const [[grupo, itens]] = model.filtrar({ busca: "delete", apenasSuportados: false });
  assert.equal(grupo, "ui");
  assert.deepEqual(itens.map((i) => i.nome), ["delete", "trash", "x"]);
  assert.deepEqual(model.filtrar({ busca: "  HOME ", apenasSuportados: false }).map(([g]) => g), ["home"]);
  assert.deepEqual(model.filtrar({ busca: "nada", apenasSuportados: false }), []);
});

test("contarEm: só conjuntos já baixados; nada baixado é null", () => {
  const model = modelo();
  model.cache.set("feather", { itens: [item("trash 2", "x", ["delete"]), item("bin", "x")], usouAlternativa: false });
  assert.equal(model.contarEm("feather", "delete"), 1);
  assert.equal(model.contarEm("feather", "zzz"), 0);
  assert.equal(model.contarEm("bootstrap", "delete"), null);
});

test("carregar: tags que não chegam não trocam as categorias pela lista de letras", async () => {
  const model = new IconModel();
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes("tags")
      ? { ok: false, status: 404 }
      : { ok: true, json: async () => (String(url).includes("categories") ? { home: ["buildings"] } : { home: [["path", { d: "M1 1" }]] }) };
  const avisos = console.warn;
  console.warn = () => {};
  try {
    const dados = await model.carregar("lucide");
    assert.equal(dados.usouAlternativa, false);
    assert.deepEqual(dados.itens[0].tags, []);
    assert.equal(dados.itens[0].grupo, "buildings");
  } finally {
    globalThis.fetch = original;
    console.warn = avisos;
  }
});

test("conjuntos: Lucide e Feather levam as tags de cada ícone", () => {
  const [lucide] = FONTES.lucide.montar([{ "trash-2": [] }, undefined, { "trash-2": ["garbage"] }]);
  assert.deepEqual(lucide.tags, ["garbage"]);
  const [feather] = FONTES.feather.montar([{ "trash-2": "" }, undefined, { feather: { "trash-2": ["bin"] } }]);
  assert.deepEqual(feather.tags, ["bin"]);
  const [semTags] = FONTES.feather.montar([{ x: "" }, undefined, undefined]);
  assert.deepEqual(semTags.tags, []);
});

test("generate-icon-tags: lê as tags do cabeçalho e os arquivos de um .tar", () => {
  const pagina = "---\ntitle: Trash\ncategories:\n  - UI\ntags:\n  - trash-can\n  - 'garbage'\n  - delete\n---\n# Trash\n";
  assert.deepEqual(tagsDoCabecalho(pagina), ["trash-can", "garbage", "delete"]);
  assert.deepEqual(tagsDoCabecalho("---\ntitle: X\n---\n"), []);
  // Um .tar mínimo: cabeçalho de 512 bytes, conteúdo em blocos de 512, fim zerado
  const conteudo = Buffer.from("olá");
  const cabecalho = Buffer.alloc(512);
  cabecalho.write("pasta/a.md", 0);
  cabecalho.write(conteudo.length.toString(8).padStart(11, "0"), 124);
  cabecalho.write("0", 156);
  const tar = Buffer.concat([cabecalho, conteudo, Buffer.alloc(512 - conteudo.length), Buffer.alloc(1024)]);
  const [arquivo, ...resto] = lerTar(tar);
  assert.equal(arquivo.nome, "pasta/a.md");
  assert.equal(arquivo.conteudo.toString("utf8"), "olá");
  assert.equal(resto.length, 0);
});

test("filtrar: com busca, a categoria com o melhor acerto vem primeiro", () => {
  const model = new IconModel();
  model.exibir("lucide", {
    itens: [
      item("bookmark minus", "account", ["remove", "deleted"]),
      item("trash", "files", ["delete"]),
      item("delete column", "text"),
    ],
    usouAlternativa: false,
  });
  // Nome (text) antes de tag igual (files) antes de tag que só contém (account)
  assert.deepEqual(model.filtrar({ busca: "delete", apenasSuportados: false }).map(([g]) => g), ["text", "files", "account"]);
  // Sem busca, a ordem alfabética de sempre
  assert.deepEqual(model.filtrar({ busca: "", apenasSuportados: false }).map(([g]) => g), ["account", "files", "text"]);
});

test("filtrar: nome igual antes de nome que começa com a palavra, antes de nome que a contém", () => {
  const model = new IconModel();
  model.exibir("lucide", {
    itens: [item("trash off", "a"), item("bin trash", "b"), item("trash", "c")],
    usouAlternativa: false,
  });
  assert.deepEqual(model.filtrar({ busca: "trash", apenasSuportados: false }).map(([, [i]]) => i.nome), ["trash", "trash off", "bin trash"]);
});
