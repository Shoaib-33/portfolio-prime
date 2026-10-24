/* Database connection.
   - DATABASE_URL set (Render, production): regular PostgreSQL through node-postgres.
   - Otherwise (local demo): PGlite, real PostgreSQL compiled to WASM, stored in ./data/pg. Needs ~600 MB while starting.
   Schema, migrations and queries are identical for both. */
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';

export type DB = PgliteDatabase<typeof schema>;
const ROOT = resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.PP_DATA_DIR || resolve(ROOT, 'data');
export const STORAGE_DIR = process.env.PP_STORAGE_DIR || resolve(ROOT, 'storage');
const MIGRATIONS = resolve(ROOT, 'drizzle');
let instance: { db: DB; close: () => Promise<void> } | null = null;

export async function getDb(): Promise<DB> {
  if (instance) return instance.db;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg'); const { drizzle } = require('drizzle-orm/node-postgres'); const { migrate } = require('drizzle-orm/node-postgres/migrator');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined });
    const db = drizzle(pool, { schema }); await migrate(db, { migrationsFolder: MIGRATIONS });
    instance = { db: db as DB, close: () => pool.end() };
  } else {
    const { PGlite } = require('@electric-sql/pglite'); const { drizzle } = require('drizzle-orm/pglite'); const { migrate } = require('drizzle-orm/pglite/migrator');
    mkdirSync(DATA_DIR, { recursive: true });
    const client = new PGlite(process.env.PP_MEMORY_DB ? undefined : resolve(DATA_DIR, 'pg'));
    const db = drizzle(client, { schema }); await migrate(db, { migrationsFolder: MIGRATIONS });
    instance = { db, close: () => client.close() };
  }
  return instance.db;
}
export async function closeDb() { if (instance) { await instance.close(); instance = null; } }
export const dbKind = () => (process.env.DATABASE_URL ? 'PostgreSQL' : 'PGlite (PostgreSQL)');
export { schema };
