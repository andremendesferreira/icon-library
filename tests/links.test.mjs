// Links que abrem o editor (#svg=… / #ile=…), o llms.txt e o JSON Schema
// do .ile: os exemplos que as IAs vão copiar precisam funcionar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  deBase64,
  lerFragmento,
  linkDoProjeto,
  paraBase64,
} from "../public/js/models/linkCodec.js";
import { FORMATO_ILE, validarProjeto } from "../public/js/models/EditorModel.js";
import { lerPath } from "../public/js/models/svgGeometry.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2v20"/></svg>';
const ler = (caminho) => readFileSync(new URL(`../public/${caminho}`, import.meta.url), "utf8");

test("lerFragmento: SVG codificado para URL, com nome", () => {
  assert.deepEqual(lerFragmento(`#name=my%20icon&svg=${encodeURIComponent(SVG)}`), {
    tipo: "svg",
    conteudo: SVG,
    nome: "my icon",
  });
});

test("lerFragmento: o conteúdo vai até o fim, mesmo com & e % soltos", () => {
  const svg = '<svg><text>A & B 50%</text></svg>';
  assert.equal(lerFragmento(`#svg=${svg}`).conteudo, svg);
});

test("lerFragmento: base64url, inclusive com acentos", () => {
  const svg = "<svg><title>coração</title></svg>";
  assert.equal(deBase64(paraBase64(svg)), svg);
  assert.equal(lerFragmento(`#svg=${paraBase64(svg)}`).conteudo, svg);
});

test("lerFragmento: sem ícone no endereço, nada acontece", () => {
  assert.equal(lerFragmento(""), null);
  assert.equal(lerFragmento("#top"), null);
  assert.equal(lerFragmento("#svg="), null);
});

test("lerFragmento: conteúdo inválido vira mensagem legível", () => {
  assert.throws(() => lerFragmento("#svg=***"), /no valid SVG/);
  assert.throws(() => lerFragmento("#ile=***"), /no valid \.ile/);
});

test("linkDoProjeto: ida e volta pelo endereço", () => {
  const projeto = { formato: FORMATO_ILE, versao: 1, nome: "ação", raiz: {}, elementos: [] };
  const link = linkDoProjeto("https://iconlibrary.io/", projeto);
  assert.match(link, /^https:\/\/iconlibrary\.io\/#ile=[A-Za-z0-9_-]+$/);
  const lido = lerFragmento(new URL(link).hash);
  assert.equal(lido.tipo, "ile");
  assert.deepEqual(JSON.parse(lido.conteudo), projeto);
});

test("validarProjeto: projeto mínimo, sem grupos (como uma IA escreveria)", () => {
  const projeto = validarProjeto({
    formato: FORMATO_ILE,
    versao: 1,
    raiz: { viewBox: "0 0 24 24" },
    elementos: [{ tag: "circle", attrs: { cx: "12", cy: "12", r: "4" } }],
  });
  assert.equal(projeto.nome, "icon");
  assert.deepEqual(projeto.grupos, [{ nome: "icon" }]);
  assert.deepEqual(projeto.elementos[0], {
    tag: "circle", grupo: 0, oculto: false, attrs: { cx: "12", cy: "12", r: "4" },
  });
});

test("llms.txt: o link de exemplo abre um SVG válido", () => {
  const texto = ler("llms.txt");
  const link = texto.match(/^https:\/\/iconlibrary\.io\/#name=add-circle&svg=\S+$/m)?.[0];
  assert.ok(link, "link de exemplo não encontrado");
  const lido = lerFragmento(new URL(link).hash);
  assert.equal(lido.nome, "add-circle");
  assert.match(lido.conteudo, /^<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<\/svg>$/);
  for (const [, d] of lido.conteudo.matchAll(/ d="([^"]+)"/g)) lerPath(d);
});

test("llms.txt: o projeto de exemplo é válido e os paths são legíveis", () => {
  const texto = ler("llms.txt");
  const json = texto.match(/```json\n([\s\S]*?)\n```/)?.[1];
  assert.ok(json, "projeto de exemplo não encontrado");
  const projeto = validarProjeto(JSON.parse(json));
  assert.deepEqual(projeto.grupos.map((g) => g.nome), ["heart", "star"]);
  for (const el of projeto.elementos) if (el.tag === "path") lerPath(el.attrs.d);
});

test("JSON Schema: JSON válido, com as mesmas regras do validador", () => {
  const schema = JSON.parse(ler("schema/ile.schema.json"));
  assert.equal(schema.properties.formato.const, FORMATO_ILE);
  assert.deepEqual(schema.required, ["formato", "versao", "raiz", "elementos"]);
  const formas = schema.properties.elementos.items.oneOf[0].properties.tag.enum;
  assert.deepEqual(formas, ["path", "line", "circle", "ellipse", "rect", "polyline", "polygon"]);
});
