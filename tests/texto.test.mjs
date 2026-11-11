// Arquivos de texto do projeto sem caracteres de controle soltos. Um "\b"
// escrito por um script sem string crua virou o caractere 0x08 dentro de uma
// regex do PublishController, e a regex nunca casava.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const raiz = new URL("../", import.meta.url);
const TEXTO = /\.(m?js|html|css|json|md|txt|xml|svg|sql|yml|yaml)$/;

test("nenhum arquivo de texto tem caractere de controle (fora tab, LF e CR)", () => {
  const arquivos = execFileSync("git", ["ls-files"], { cwd: raiz, encoding: "utf8" })
    .split("\n")
    // Arquivos de terceiros ficam byte a byte como vieram
    .filter((f) => TEXTO.test(f) && !f.startsWith("public/js/vendor/"));
  assert.ok(arquivos.length > 50, "a lista de arquivos veio do git");
  const ruins = [];
  for (const f of arquivos) {
    const texto = readFileSync(new URL(f, raiz), "utf8");
    texto.split("\n").forEach((linha, i) => {
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(linha)) ruins.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(ruins, []);
});
