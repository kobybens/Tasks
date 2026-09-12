import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Create a libSQL client from environment variables.
 * DATABASE_URL: file:data/family.db | file::memory: | libsql://...
 */
export function createDb(url = process.env.DATABASE_URL, authToken = process.env.DATABASE_AUTH_TOKEN) {
  if (!url) throw new Error('DATABASE_URL is not set');
  return createClient(authToken ? { url, authToken } : { url });
}

/** Apply every server/migrations/*.sql not yet recorded in the migrations table. */
export async function runMigrations(db) {
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute(
    `CREATE TABLE IF NOT EXISTS migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
  );
  const applied = new Set((await db.execute('SELECT name FROM migrations')).rows.map((r) => r.name));
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(
      [
        ...statements.map((s) => ({ sql: s, args: [] })),
        { sql: 'INSERT INTO migrations (name) VALUES (?)', args: [file] },
      ],
      'write',
    );
  }
}

/** Return the first row of a query, or undefined. */
export async function one(db, sql, args = []) {
  const { rows } = await db.execute({ sql, args });
  return rows[0];
}

/** Return all rows of a query. */
export async function all(db, sql, args = []) {
  const { rows } = await db.execute({ sql, args });
  return rows;
}

/** Run a write statement and return { lastInsertRowid, rowsAffected }. */
export async function run(db, sql, args = []) {
  const r = await db.execute({ sql, args });
  return { lastInsertRowid: Number(r.lastInsertRowid), rowsAffected: r.rowsAffected };
}
