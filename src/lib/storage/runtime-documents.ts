import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureRuntimeSchema, getSql, hasDatabase } from './neon';

function localPath(key: string) {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`Invalid runtime document key: ${key}`);
  return path.join(process.env.PIPELINE_CACHE_DIR || path.join(process.cwd(), '.demo-runtime'), `${key}.json`);
}

export async function readRuntimeDocument<T>(key: string): Promise<T | null> {
  if (hasDatabase()) {
    await ensureRuntimeSchema();
    const rows = await getSql()`SELECT payload FROM aerchain_runtime_documents WHERE document_key = ${key}`;
    return rows[0]?.payload as T | undefined ?? null;
  }
  try {
    return JSON.parse(await readFile(localPath(key), 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeRuntimeDocument<T>(key: string, payload: T) {
  if (hasDatabase()) {
    await ensureRuntimeSchema();
    await getSql()`
      INSERT INTO aerchain_runtime_documents (document_key, payload, updated_at)
      VALUES (${key}, ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (document_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
    return;
  }
  const destination = localPath(key);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
}
