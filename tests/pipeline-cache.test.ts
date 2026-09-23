import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { z } from 'zod';
import { readPipelineStage, writePipelineStage } from '../src/lib/storage/pipeline-cache';

test('reuses only a validated pipeline stage with the same input hash', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'aerchain-cache-test-'));
  process.env.PIPELINE_CACHE_DIR = directory;
  const schema = z.object({ content: z.string(), count: z.number() });

  try {
    await writePipelineStage('vendor-test', 'extraction', 'artifact-hash-v1', { content: 'OCR result', count: 30 });
    assert.deepEqual(
      await readPipelineStage('vendor-test', 'extraction', 'artifact-hash-v1', schema),
      { content: 'OCR result', count: 30 },
    );
    assert.equal(await readPipelineStage('vendor-test', 'extraction', 'changed-artifact', schema), null);
    assert.equal(await readPipelineStage('vendor-test', 'extraction', 'artifact-hash-v1', z.object({ missing: z.string() })), null);
  } finally {
    delete process.env.PIPELINE_CACHE_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
