/* Database connection. Demo mode uses PGlite (real PostgreSQL compiled to WASM, stored in ./data/pg).
   Production: set DATABASE_URL and switch to drizzle-orm/node-postgres; the schema and queries stay the same. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle, PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import * as schema from './schema';

export type DB = PgliteDatabase<typeof schema>;
const ROOT = resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.PP_DATA_DIR || resolve(ROOT, 'data');
export const STORAGE_DIR = process.env.PP_STORAGE_DIR || resolve(ROOT, 'storage');
let instance: { db: DB; client: PGlite } | null = null;

export async function getDb(): Promise<DB> {
  if (instance) return instance.db;
  mkdirSync(DATA_DIR, { recursive: true }); mkdirSync(STORAGE_DIR, { recursive: true });
  const client = new PGlite(process.env.PP_MEMORY_DB ? undefined : resolve(DATA_DIR, 'pg'));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(ROOT, 'drizzle') });
  instance = { db, client };
  return db;
}
export async function closeDb() { if (instance) { await instance.client.close(); instance = null; } }
export { schema };
