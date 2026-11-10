"use strict";
/**
 * Keywords (tags) for Feather and Bootstrap Icons, so that a search for
 * "delete" finds trash. The npm packages do not ship them: they live in the
 * repositories, in Feather's src/tags.json and in the front matter of each
 * Bootstrap docs page. Lucide ships its own (lucide-static/tags.json), which
 * the browser reads directly.
 *
 * Run by hand (npm run tags) when a set version changes in
 * public/js/models/iconSets.js; the versions here must match.
 * Writes public/json/icons-tags.json: { versoes, feather: {name: [tags]},
 * bootstrap: {name: [tags]} }.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const VERSOES = { feather: "4.29.2", bootstrap: "1.13.2" };
const SAIDA = path.join(__dirname, "..", "public", "json", "icons-tags.json");

async function baixar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Files in an (already gunzipped) .tar: [{ nome, conteudo }]. The format is
// simple: 512-byte blocks, each file a header followed by its content.
function lerTar(tar) {
  const arquivos = [];
  for (let pos = 0; pos + 512 <= tar.length; ) {
    const cabecalho = tar.subarray(pos, pos + 512);
    const nome = cabecalho.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    if (!nome) break;
    const prefixo = cabecalho.subarray(345, 500).toString("utf8").replace(/\0.*$/s, "");
    const tamanho = parseInt(cabecalho.subarray(124, 136).toString("utf8").trim(), 8) || 0;
    const tipo = String.fromCharCode(cabecalho[156] || 48);
    if (tipo === "0" || tipo === "\0")
      arquivos.push({ nome: prefixo ? `${prefixo}/${nome}` : nome, conteudo: tar.subarray(pos + 512, pos + 512 + tamanho) });
    pos += 512 + Math.ceil(tamanho / 512) * 512;
  }
  return arquivos;
}

// "tags:" from the front matter of a Bootstrap docs page
function tagsDoCabecalho(texto) {
  const cabecalho = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto)?.[1] ?? "";
  const tags = [];
  let dentro = false;
  for (const linha of cabecalho.split(/\r?\n/)) {
    if (/^tags:\s*$/.test(linha)) dentro = true;
    else if (dentro && /^\s+-\s+/.test(linha)) tags.push(linha.replace(/^\s+-\s+/, "").trim().replace(/^["']|["']$/g, ""));
    else if (dentro && /^\S/.test(linha)) dentro = false;
  }
  return tags.filter(Boolean);
}

async function main() {
  const feather = JSON.parse(
    (await baixar(`https://cdn.jsdelivr.net/gh/feathericons/feather@v${VERSOES.feather}/src/tags.json`)).toString("utf8"),
  );
  const tar = zlib.gunzipSync(await baixar(`https://codeload.github.com/twbs/icons/tar.gz/refs/tags/v${VERSOES.bootstrap}`));
  const bootstrap = {};
  for (const { nome, conteudo } of lerTar(tar)) {
    const icone = /\/docs\/content\/icons\/([^/]+)\.md$/.exec(nome)?.[1];
    if (!icone) continue;
    const tags = tagsDoCabecalho(conteudo.toString("utf8"));
    if (tags.length) bootstrap[icone] = tags;
  }
  const ordenado = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, "en")));
  fs.writeFileSync(SAIDA, JSON.stringify({ versoes: VERSOES, feather: ordenado(feather), bootstrap: ordenado(bootstrap) }) + "\n");
  console.log(`${Object.keys(feather).length} Feather and ${Object.keys(bootstrap).length} Bootstrap icons with tags → ${path.relative(process.cwd(), SAIDA)}`);
}

if (require.main === module)
  main().catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });

module.exports = { lerTar, tagsDoCabecalho };
