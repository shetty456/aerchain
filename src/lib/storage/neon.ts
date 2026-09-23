import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

const storageGlobal = globalThis as typeof globalThis & {
  __aerchainSql?: NeonQueryFunction<false, false>;
  __aerchainSchemaReady?: Promise<void>;
};

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getSql() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DATABASE_URL is not configured.');
  return storageGlobal.__aerchainSql ??= neon(connectionString);
}

export function ensureRuntimeSchema() {
  if (!hasDatabase()) return Promise.resolve();
  if (!storageGlobal.__aerchainSchemaReady) {
    const sql = getSql();
    storageGlobal.__aerchainSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS aerchain_runtime_documents (
          document_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS aerchain_pipeline_stages (
          vendor_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          input_hash TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (vendor_id, stage, input_hash)
        )
      `;
    })().catch((error) => {
      storageGlobal.__aerchainSchemaReady = undefined;
      throw error;
    });
  }
  return storageGlobal.__aerchainSchemaReady;
}
