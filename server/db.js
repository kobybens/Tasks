import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Create a database handle from DATABASE_URL.
 *
 *   postgres://user:pass@host/db   real Postgres (Neon, Render, local) via `pg`
 *   pglite://data/pg               embedded Postgres persisted to that directory (local dev)
 *   memory://                      embedded Postgres in memory (tests)
 *
 * Every handle exposes the same small interface:
 *   query(sql, params) -> { rows, rowCount }     single statement, $1.. placeholders
 *   exec(sql)          -> void                   several statements, no params (migrations)
 *   close()            -> Promise<void>
 */
export async function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return pgHandle(url);
  if (url.startsWith('pglite://')) return pgliteHandle(url.slice('pglite://'.length));
  if (url === 'memory://') return pgliteHandle(undefined);
  throw new Error(`Unsupported DATABASE_URL: ${url}`);
}

async function pgHandle(url) {
  const { default: pg } = await import('pg');
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  u.searchParams.delete('sslmode');
  const pool = new pg.Pool({ connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: true }, max: 5 });
  return {
    async query(sql, params = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

async function pgliteHandle(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return {
    async query(sql, params = []) {
      const r = await db.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    async exec(sql) {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}

/** Apply every server/migrations/*.sql not yet recorded in the migrations table. */
export async function runMigrations(db) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  const applied = new Set((await db.query('SELECT name FROM migrations')).rows.map((r) => r.name));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    await db.exec(`BEGIN;\n${sql}\nINSERT INTO migrations (name) VALUES ('${file.replace(/'/g, "''")}');\nCOMMIT;`);
  }
}

/** Convert `?` placeholders to Postgres `$1, $2, ...`. Our SQL never has `?` inside string literals. */
function positional(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Return the first row of a query, or undefined. */
export async function one(db, sql, args = []) {
  const { rows } = await db.query(positional(sql), args);
  return rows[0];
}

/** Return all rows of a query. */
export async function all(db, sql, args = []) {
  const { rows } = await db.query(positional(sql), args);
  return rows;
}

/** Run a write statement. Returns { rowsAffected, rows } — use `RETURNING id` and read rows[0].id for inserts. */
export async function run(db, sql, args = []) {
  const { rows, rowCount } = await db.query(positional(sql), args);
  return { rowsAffected: rowCount, rows };
}
