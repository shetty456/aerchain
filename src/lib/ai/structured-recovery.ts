import { jsonrepair } from 'jsonrepair';
import type { z } from 'zod';

function removeObjectArrayPlaceholders(value: unknown): unknown {
  if (Array.isArray(value)) {
    const containsObjects = value.some((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
    const items = containsObjects ? value.filter((item) => item !== '') : value;
    return items.map(removeObjectArrayPlaceholders);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, removeObjectArrayPlaceholders(child)]));
  }
  return value;
}

export function recoverFailedGeneration<TSchema extends z.ZodType>(failedGeneration: string, schema: TSchema): z.infer<TSchema> {
  // GPT-OSS can occasionally prefix later array objects with a stray quote:
  // [{...},"{"field":...}] → [{...},{"field":...}]. Repair only this
  // structural position, then require full schema validation.
  const withoutQuotedObjects = failedGeneration.replace(/([,[])\s*"\{/g, '$1{');
  let repaired = JSON.parse(jsonrepair(withoutQuotedObjects));
  // Some compatible providers wrap the entire JSON document in a JSON string.
  // Unwrap only valid JSON strings, then still require full domain validation.
  if (typeof repaired === 'string') {
    try { repaired = JSON.parse(jsonrepair(repaired)); } catch { /* Schema validation below reports the original malformed shape. */ }
  }
  return schema.parse(removeObjectArrayPlaceholders(repaired));
}
