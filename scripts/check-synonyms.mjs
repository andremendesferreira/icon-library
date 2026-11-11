// Checks the search synonyms (public/json/sinonimos/<lang>.json): every entry
// must find at least one icon in Lucide, Feather or Bootstrap, by name or
// keyword, the same way the page searches. A dead entry is listed.
//
//   node scripts/check-synonyms.mjs            all languages
//   node scripts/check-synonyms.mjs pt-BR      one language
//
// Lucide names and tags come from unpkg at the version pinned in
// public/js/models/iconSets.js; Feather and Bootstrap from public/json/.
import { readFileSync, readdirSync } from "node:fs";

const raiz = new URL("../", import.meta.url);
const ler = (p) => JSON.parse(readFileSync(new URL(p, raiz), "utf8"));

const conjuntos = readFileSync(new URL("public/js/models/iconSets.js", raiz), "utf8");
const versao = /lucide:\s*"([\d.]+)"/.exec(conjuntos)?.[1];
if (!versao) throw new Error("Lucide version not found in iconSets.js");

const itens = [];
const tagsLucide = await (await fetch(`https://unpkg.com/lucide-static@${versao}/tags.json`)).json();
for (const [nome, tags] of Object.entries(tagsLucide)) itens.push({ nome, tags });
const categorias = ler("public/json/icons-categories.json");
const tagsLocais = ler("public/json/icons-tags.json");
for (const conjunto of ["feather", "bootstrap"])
  for (const nome of Object.keys(categorias[conjunto])) itens.push({ nome, tags: tagsLocais[conjunto]?.[nome] ?? [] });

// Same rule as the page for dictionary terms (acertoDoSinonimo in
// public/js/models/IconModel.js): whole words of the name, or an exact keyword
const acha = (termo) => {
  const pedidas = termo.split(/[-\s]+/);
  return itens.some((i) => {
    const partes = i.nome.toLowerCase().split(/[-\s]+/);
    return pedidas.every((p) => partes.includes(p)) || i.tags.some((t) => String(t).toLowerCase() === termo);
  });
};

const pedidos = process.argv[2] ? [`${process.argv[2]}.json`] : readdirSync(new URL("public/json/sinonimos/", raiz));
let falhas = 0;
for (const arquivo of pedidos) {
  const dic = ler(`public/json/sinonimos/${arquivo}`);
  const mortas = [];
  const termosMortos = [];
  for (const [chave, termos] of Object.entries(dic)) {
    const vivos = termos.filter(acha);
    if (!vivos.length) mortas.push(chave);
    for (const t of termos) if (!acha(t)) termosMortos.push(`${chave} → ${t}`);
  }
  console.log(`${arquivo}: ${Object.keys(dic).length} entries, ${itens.length} icons checked (Lucide ${versao})`);
  if (mortas.length) console.log(`  entries that find nothing: ${mortas.join(", ")}`);
  if (termosMortos.length) console.log(`  terms that find nothing (entry still works): ${termosMortos.join(" · ")}`);
  falhas += mortas.length;
}
process.exitCode = falhas ? 1 : 0;
