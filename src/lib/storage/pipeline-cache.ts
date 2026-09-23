import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { ensureRuntimeSchema, getSql, hasDatabase } from './neon';

type PipelineStage =
  | 'extraction'
  | 'mapping'
  | 'mapping-metadata'
  | `mapping-lines-${number}`
  | 'normalization';

interface CacheEnvelope<T> {
  version: 1;
  inputHash: string;
  createdAt: string;
  data: T;
}

function stagePath(vendorId: string, stage: PipelineStage) {
  if (!/^[a-z0-9-]+$/.test(vendorId)) throw new Error(`Invalid vendor cache key: ${vendorId}`);
  if (!/^[a-z0-9-]+$/.test(stage)) throw new Error(`Invalid pipeline stage: ${stage}`);
  const runtimeDirectory = process.env.PIPELINE_CACHE_DIR || path.join(process.cwd(), '.demo-runtime', 'vendors');
  return path.join(runtimeDirectory, vendorId, `${stage}.json`);
}

export async function readPipelineStage<TSchema extends z.ZodType>(
  vendorId: string,
  stage: PipelineStage,
  inputHash: string,
  schema: TSchema,
): Promise<z.infer<TSchema> | null> {
  if (hasDatabase()) {
    try {
      await ensureRuntimeSchema();
      const rows = await getSql()`
        SELECT payload FROM aerchain_pipeline_stages
        WHERE vendor_id = ${vendorId} AND stage = ${stage} AND input_hash = ${inputHash}
      `;
      return rows[0] ? schema.parse(rows[0].payload) : null;
    } catch {
      return null;
    }
  }
  try {
    const envelope = JSON.parse(await readFile(stagePath(vendorId, stage), 'utf8')) as CacheEnvelope<unknown>;
    if (envelope.version !== 1 || envelope.inputHash !== inputHash) return null;
    return schema.parse(envelope.data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function writePipelineStage<T>(vendorId: string, stage: PipelineStage, inputHash: string, data: T) {
  if (hasDatabase()) {
    await ensureRuntimeSchema();
    await getSql()`
      INSERT INTO aerchain_pipeline_stages (vendor_id, stage, input_hash, payload)
      VALUES (${vendorId}, ${stage}, ${inputHash}, ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (vendor_id, stage, input_hash) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()
    `;
    return;
  }
  const destination = stagePath(vendorId, stage);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  const envelope: CacheEnvelope<T> = { version: 1, inputHash, createdAt: new Date().toISOString(), data };
  await writeFile(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, destination);
}
