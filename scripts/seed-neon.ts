import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ensureRuntimeSchema, getSql } from '../src/lib/storage/neon';

async function main() {
  await ensureRuntimeSchema();
  const sql = getSql();
  const runtimeDirectory = path.join(process.cwd(), '.demo-runtime');
  const documents = [['event-run', 'event-run.json'], ['clarifications', 'clarifications.json'], ['award', 'award.json']] as const;
  for (const [key, fileName] of documents) {
    try {
      const payload = JSON.parse(await readFile(path.join(runtimeDirectory, fileName), 'utf8'));
      await sql`
        INSERT INTO aerchain_runtime_documents (document_key, payload, updated_at)
        VALUES (${key}, ${JSON.stringify(payload)}::jsonb, NOW())
        ON CONFLICT (document_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      `;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const vendorsDirectory = path.join(runtimeDirectory, 'vendors');
  for (const vendorId of await readdir(vendorsDirectory)) {
    for (const fileName of await readdir(path.join(vendorsDirectory, vendorId))) {
      if (!fileName.endsWith('.json')) continue;
      const envelope = JSON.parse(await readFile(path.join(vendorsDirectory, vendorId, fileName), 'utf8')) as { inputHash: string; data: unknown };
      const stage = fileName.slice(0, -5);
      await sql`
        INSERT INTO aerchain_pipeline_stages (vendor_id, stage, input_hash, payload)
        VALUES (${vendorId}, ${stage}, ${envelope.inputHash}, ${JSON.stringify(envelope.data)}::jsonb)
        ON CONFLICT (vendor_id, stage, input_hash) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()
      `;
    }
  }
  const stageCount = await sql`SELECT COUNT(*)::int AS count FROM aerchain_pipeline_stages`;
  console.log(`Neon ready: ${stageCount[0].count} validated pipeline stages stored.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
