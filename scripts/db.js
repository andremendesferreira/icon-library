"use strict";
/**
 * PostgreSQL: connection pool built from the environment and the migration
 * runner.
 *
 * Migrations are the numbered .sql files in migrations/ (001_…, 002_…). On
 * start-up the server applies, in order, the ones not yet recorded in
 * schema_migrations — each inside its own transaction, under an advisory lock
 * so two containers starting together do not run them twice.
 *
 *   npm run migrate      applies pending migrations and exits
 *
 * Environment: PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE, PG_SSL.
 */
const fs = require("fs");
const path = require("path");

const MIGRATIONS = path.resolve(__dirname, "..", "migrations");
// Arbitrary number shared by every instance of this app
const LOCK = 7_426_011;

function poolFromEnv(env = process.env) {
  if (!env.PG_HOST) return null;
  // Loaded only when used: without a database the site has no dependencies
  const { Pool } = require("pg");
  const pool = new Pool({
    host: env.PG_HOST,
    port: Number(env.PG_PORT) || 5432,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    database: env.PG_DATABASE,
    ssl: env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  pool.on("error", (err) => console.error("[db]", err.message));
  return pool;
}

function migrationFiles(dir = MIGRATIONS) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort();
}

// Applies pending migrations; returns the names applied now
async function migrate(pool, { dir = MIGRATIONS, log = console.log } = {}) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK]);
    // Only created when missing: an application user without CREATE
    // permission (migrations run by the owner) must still get through when
    // there is nothing pending
    const { rows: existe } = await client.query("SELECT to_regclass('schema_migrations') AS t");
    if (!existe[0].t)
      await client.query(`CREATE TABLE schema_migrations (
        name        text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));
    const applied = [];
    for (const file of migrationFiles(dir)) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
      applied.push(file);
      log(`[db] migration applied: ${file}`);
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK]).catch(() => {});
    client.release();
  }
}

// Reads every table the application uses, with the application's user.
// Throws a clear message on a wrong password, a missing table or a missing
// GRANT (the pg error message already says which).
async function checkDatabase(pool) {
  for (const table of ["coffee_supporters", "iconlibrary_icons"]) {
    try {
      await pool.query(`SELECT 1 FROM ${table} LIMIT 1`);
    } catch (err) {
      throw new Error(`cannot use the database (table ${table}): ${err.message}`);
    }
  }
}

module.exports = { poolFromEnv, migrate, migrationFiles, checkDatabase };

if (require.main === module) {
  const pool = poolFromEnv();
  if (!pool) {
    console.error("PG_HOST is not set");
    process.exit(1);
  }
  migrate(pool)
    .then((applied) => console.log(applied.length ? "Done." : "Nothing to apply."))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
