import 'server-only';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';

/** Minimal query interface shared by node-postgres (Neon / Vercel Postgres) and PGlite (local dev, tests). */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
}

type Global = typeof globalThis & { __rasaDb?: Promise<Db> };

async function connectPg(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  // TLS comes from the connection string (Neon / Vercel Postgres URLs carry sslmode=require).
  const pool = new Pool({ connectionString: url, max: 3 });
  const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db['query'] =>
    async <T,>(s: string, p?: unknown[]) => (await c.query(s, p)).rows as T[];
  const db: Db = {
    query: wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const inner: Db = { query: wrap(client), tx: f => f(inner) };
        const out = await fn(inner);
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
    },
  };
  return db;
}

async function connectPglite(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '.data', 'pglite');
  await mkdir(dir, { recursive: true });
  const pg = await PGlite.create(dir);
  type Q = { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> };
  const wrap = (c: Q): Db['query'] => async <T,>(s: string, p?: unknown[]) => (await c.query(s, p)).rows as T[];
  return {
    query: wrap(pg),
    tx: fn => pg.transaction(async t => {
      const inner: Db = { query: wrap(t), tx: f => f(inner) };
      return fn(inner);
    }),
  };
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const db = url ? await connectPg(url) : await connectPglite();
  for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) await db.query(stmt);
  return db;
}

export function getDb(): Promise<Db> {
  const g = globalThis as Global;
  if (!g.__rasaDb) g.__rasaDb = init().catch(e => { g.__rasaDb = undefined; throw e; });
  return g.__rasaDb;
}
