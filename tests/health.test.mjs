// Checagem do banco na partida e /api/health: uma migration esquecida ou um
// GRANT faltando aparece no log e no healthcheck, não no primeiro pagamento
// (como em 2026-11-04, quando faltou a 005). Banco falso, sem Postgres.
import { test } from "node:test";
import assert from "node:assert/strict";

import banco from "../scripts/db.js";
import servidor from "../scripts/server.js";

// Responde como o Postgres às consultas da checagem: tabelas existentes,
// privilégios concedidos e migrations registradas (null = sem schema_migrations)
function poolFalso({ tabelas = [], privilegios = {}, registradas = null }) {
  return {
    async query(sql, params = []) {
      if (sql.includes("to_regclass('schema_migrations')")) return { rows: [{ t: registradas ? "schema_migrations" : null }] };
      if (sql.includes("FROM schema_migrations")) return { rows: registradas.map((name) => ({ name })) };
      if (sql.includes("to_regclass($1)")) return { rows: [{ t: tabelas.includes(params[0]) ? params[0] : null }] };
      if (sql.includes("has_table_privilege")) {
        const tem = privilegios[params[0]] || [];
        return { rows: params[1].filter((p) => !tem.includes(p)).map((p) => ({ p })) };
      }
      throw new Error(`consulta inesperada: ${sql}`);
    },
  };
}

test("migrations pendentes: as que faltam em schema_migrations, ou todas sem a tabela", async () => {
  const todas = banco.migrationFiles();
  assert.deepEqual(await banco.pendingMigrations(poolFalso({ registradas: todas })), []);
  assert.deepEqual(await banco.pendingMigrations(poolFalso({ registradas: todas.slice(0, -1) })), todas.slice(-1));
  assert.deepEqual(await banco.pendingMigrations(poolFalso({})), todas);
});

test("checagem por recurso: tabela que falta e GRANT que falta, com o nome de cada um", async () => {
  const cafe = Object.keys(banco.FEATURE_TABLES.coffee);
  const tudo = Object.fromEntries(cafe.map((t) => [t, banco.FEATURE_TABLES.coffee[t]]));
  await banco.checkDatabase(poolFalso({ tabelas: cafe, privilegios: tudo }), "coffee");
  // O incidente: sem coffee_renewals, o café não pode ficar ligado
  await assert.rejects(
    banco.checkDatabase(poolFalso({ tabelas: ["coffee_supporters"], privilegios: tudo }), "coffee"),
    /table coffee_renewals does not exist/,
  );
  await assert.rejects(
    banco.checkDatabase(poolFalso({ tabelas: cafe, privilegios: { ...tudo, coffee_renewals: ["SELECT"] } }), "coffee"),
    /no INSERT on coffee_renewals \(GRANT missing\)/,
  );
  // Senha errada, banco fora do ar…: a mensagem do pg vem junto
  const caido = { query: async () => { throw new Error("password authentication failed"); } };
  await assert.rejects(banco.checkDatabase(caido, "reports"), /cannot use the database: password authentication failed/);
});

test("toda tabela que o código usa está numa migration", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = banco.migrationFiles().map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8")).join("\n");
  for (const tabelas of Object.values(banco.FEATURE_TABLES))
    for (const tabela of Object.keys(tabelas)) assert.match(sql, new RegExp(`CREATE TABLE (IF NOT EXISTS )?${tabela}\\b`), tabela);
});

test("/api/health: 200 quando a partida passou, 503 com a migration pendente", async () => {
  const pedir = async (opcoes, metodo = "GET") => {
    const instancia = servidor.createServer(opcoes);
    await new Promise((r) => instancia.listen(0, "127.0.0.1", r));
    try {
      const r = await fetch(`http://127.0.0.1:${instancia.address().port}/api/health`, { method: metodo });
      return { status: r.status, corpo: metodo === "GET" ? await r.json() : null, cache: r.headers.get("cache-control") };
    } finally {
      instancia.close();
    }
  };
  // Sem banco configurado (CI, desenvolvimento): saudável
  const semBanco = await pedir();
  assert.equal(semBanco.status, 200);
  assert.equal(semBanco.corpo.ok, true);
  assert.equal(semBanco.corpo.database, "off");
  assert.equal(semBanco.corpo.coffee, false);
  assert.equal(semBanco.cache, "no-store");
  const pendente = await pedir({ health: { ok: false, database: "error", pendingMigrations: ["005_coffee_renewals.sql"] } });
  assert.equal(pendente.status, 503);
  assert.deepEqual(pendente.corpo.pendingMigrations, ["005_coffee_renewals.sql"]);
  assert.equal((await pedir({}, "POST")).status, 405);
});
