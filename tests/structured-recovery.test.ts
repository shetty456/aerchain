import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { recoverFailedGeneration } from '../src/lib/ai/structured-recovery';

test('repairs GPT-OSS stray quotes between generated array objects', () => {
  const schema = z.object({ items: z.array(z.object({ id: z.string() })) });
  const malformed = '{"items":[{"id":"HW-001"},"{"id":"HW-002"},"{"id":"HW-003"}]}';
  assert.deepEqual(recoverFailedGeneration(malformed, schema), {
    items: [{ id: 'HW-001' }, { id: 'HW-002' }, { id: 'HW-003' }],
  });
});

test('rejects a repaired generation that still violates the domain schema', () => {
  const schema = z.object({ items: z.array(z.object({ id: z.string() })) });
  assert.throws(() => recoverFailedGeneration('{"items":[{"id":42}]}', schema), z.ZodError);
});
