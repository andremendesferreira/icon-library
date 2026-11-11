// Busca em português: o dicionário (public/json/sinonimos/) diz que termos em
// inglês procurar; acertos diretos continuam na frente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { expandir, prepararSinonimos, semAcento } from "../public/js/models/sinonimos.js";
import { IconModel } from "../public/js/models/IconModel.js";

const DIC = prepararSinonimos({ lixeira: ["trash", "delete"], "seta": ["arrow"], direita: ["right"], configurações: ["settings", "gear"] });

test("sinônimos: sem acento, frase inteira, palavras compostas e começo da palavra", () => {
  assert.equal(semAcento("  Configurações  Gerais "), "configuracoes gerais");
  assert.deepEqual(expandir("Lixeira", DIC), ["trash", "delete"]);
  assert.deepEqual(expandir("configuracoes", DIC), ["settings", "gear"]);
  assert.deepEqual(expandir("seta para direita", DIC), ["arrow-right", "arrow", "right"]);
  assert.deepEqual(expandir("lixe", DIC), ["trash", "delete"], "enquanto digita");
  assert.deepEqual(expandir("li", DIC), [], "curto demais para prefixo");
  assert.deepEqual(expandir("xyz", DIC), []);
  assert.deepEqual(expandir("trash", null), []);
});

test("busca: o termo traduzido acha o ícone, depois dos acertos diretos", () => {
  const m = new IconModel();
  m.itens = [
    { nome: "trash-2", grupo: "files", tags: ["garbage", "delete"] },
    { nome: "settings", grupo: "account", tags: ["cog", "gear"] },
    { nome: "lixeira-custom", grupo: "files", tags: [] },
    { nome: "arrow big right", grupo: "arrows", tags: [] },
    // Como chega do Lucide: com espaço
    { nome: "arrow right", grupo: "arrows", tags: [] },
    { nome: "carton", grupo: "food", tags: [] },
    { nome: "shopping cart", grupo: "shopping", tags: [] },
  ];
  m.sinonimos = DIC;
  const nomes = (busca) => m.filtrar({ busca }).flatMap(([, itens]) => itens.map((i) => i.nome));
  assert.deepEqual(nomes("lixeira"), ["lixeira-custom", "trash-2"], "o acerto direto vem antes");
  assert.deepEqual(nomes("Configurações"), ["settings"]);
  assert.deepEqual(nomes("seta direita"), ["arrow right", "arrow big right"], "o nome exato vem antes");
  m.sinonimos = prepararSinonimos({ carrinho: ["cart"] });
  assert.deepEqual(nomes("carrinho"), ["shopping cart"], "palavra inteira: não acha carton");
  m.sinonimos = DIC;
  // Pedaço de palavra-chave ("casino") fica depois do sinônimo ("bell")
  m.itens.push({ nome: "playing card", grupo: "games", tags: ["casino"] }, { nome: "bell", grupo: "alerts", tags: [] });
  m.sinonimos = prepararSinonimos({ sino: ["bell"] });
  assert.deepEqual(nomes("sino"), ["bell", "playing card"]);
  m.sinonimos = null;
  assert.deepEqual(nomes("configuracoes"), [], "sem dicionário, só inglês");
});

test("dicionários publicados: JSON válido, chaves e termos em texto", () => {
  const pasta = new URL("../public/json/sinonimos/", import.meta.url);
  const arquivos = readdirSync(pasta);
  assert.ok(arquivos.includes("pt-BR.json"));
  for (const f of arquivos) {
    const dados = JSON.parse(readFileSync(new URL(f, pasta), "utf8"));
    for (const [chave, termos] of Object.entries(dados)) {
      assert.ok(chave.trim(), `${f}: chave vazia`);
      assert.ok(Array.isArray(termos) && termos.length && termos.every((t) => typeof t === "string" && t === t.toLowerCase()), `${f}: ${chave}`);
    }
    assert.ok(prepararSinonimos(dados).size > 100, `${f}: poucas entradas`);
  }
});
