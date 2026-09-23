import { jsonrepair } from 'jsonrepair';
import type { z } from 'zod';

export function recoverFailedGeneration<TSchema extends z.ZodType>(failedGeneration: string, schema: TSchema): z.infer<TSchema> {
  // GPT-OSS can occasionally prefix later array objects with a stray quote:
  // [{...},"{"field":...}] → [{...},{"field":...}]. Repair only this
  // structural position, then require full schema validation.
  const withoutQuotedObjects = failedGeneration.replace(/([,[])\s*"\{/g, '$1{');
  return schema.parse(JSON.parse(jsonrepair(withoutQuotedObjects)));
}
