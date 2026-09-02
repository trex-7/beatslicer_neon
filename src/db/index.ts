import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
}

// Function to create or retrieve the connection pool.
export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.NEON_DATABASE_URL;

    if (connectionString) {
      const isNeonOrCloud = connectionString.includes('neon.tech') || connectionString.includes('sslmode=') || connectionString.includes('aws');
      global._postgresPool = new Pool({
        connectionString,
        ssl: isNeonOrCloud ? { rejectUnauthorized: false } : undefined,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
      console.log('[Neon PostgreSQL] Initialized connection pool with connection string.');
    } else {
      const isNeonHost = (process.env.SQL_HOST || '').includes('neon.tech') || (process.env.SQL_HOST || '').includes('aws');
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432,
        ssl: isNeonHost ? { rejectUnauthorized: false } : undefined,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
      console.log(`[Neon PostgreSQL] Initialized connection pool for host: ${process.env.SQL_HOST || 'local'}`);
    }

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
  }
  return global._postgresPool;
};

// Create or retrieve the pool instance.
const pool = createPool();

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });

// Auto-initialize Neon PostgreSQL tables if not already present
export async function initDatabase() {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          uid TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          username TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS samples (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          audio_data TEXT,
          is_public BOOLEAN DEFAULT FALSE NOT NULL,
          is_factory BOOLEAN DEFAULT FALSE NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS kits (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          cover_image_url TEXT,
          is_public BOOLEAN DEFAULT FALSE NOT NULL,
          is_factory BOOLEAN DEFAULT FALSE NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS kit_samples (
          id SERIAL PRIMARY KEY,
          kit_id TEXT NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
          sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS presets (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT NOT NULL,
          parameters JSONB NOT NULL,
          sequencer_data JSONB NOT NULL,
          slices_data JSONB NOT NULL,
          sample_id TEXT,
          is_public BOOLEAN DEFAULT FALSE NOT NULL,
          is_factory BOOLEAN DEFAULT FALSE NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS feedback (
          id SERIAL PRIMARY KEY,
          user_id TEXT,
          message TEXT NOT NULL,
          category TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('[Neon PostgreSQL] Schema tables verified and ready.');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.warn('[Neon PostgreSQL] Database initialization check notice:', err?.message || err);
  }
}
