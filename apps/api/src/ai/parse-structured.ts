import type { z } from 'zod';
import { LlmError } from './llm-provider';

/** Strips an optional ```json fence some models add despite the JSON mime type. */
function unwrap(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced?.[1] ?? text.trim();
}

/** Raw model text → validated value, or an `LlmError('VALIDATION')` listing the issues. */
export function parseStructured<T>(text: string | undefined | null, schema: z.ZodType<T>): T {
  if (!text || text.trim() === '') {
    throw new LlmError('VALIDATION', 'Empty response from the model', ['A resposta veio vazia.']);
  }
  let json: unknown;
  try {
    json = JSON.parse(unwrap(text));
  } catch {
    throw new LlmError('VALIDATION', 'Response is not valid JSON', [
      'A resposta não é um JSON válido.',
    ]);
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new LlmError(
      'VALIDATION',
      'Response does not match the schema',
      result.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`),
    );
  }
  return result.data;
}
