import { estimateTaskOutputSchema } from '@routinely/shared';
import { LlmError } from './llm-provider';
import { parseStructured } from './parse-structured';

const valid = { complexity: 3, estimatedMinutes: 60, splittable: true, rationale: 'ok' };

describe('parseStructured', () => {
  it('parses and validates plain JSON', () => {
    expect(parseStructured(JSON.stringify(valid), estimateTaskOutputSchema)).toEqual(valid);
  });

  it('accepts a fenced JSON block', () => {
    expect(
      parseStructured('```json\n' + JSON.stringify(valid) + '\n```', estimateTaskOutputSchema),
    ).toEqual(valid);
  });

  it.each([[''], [undefined], [null], ['   ']])('rejects an empty response (%p)', (text) => {
    expect(() => parseStructured(text, estimateTaskOutputSchema)).toThrow(LlmError);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseStructured('{"complexity": 3', estimateTaskOutputSchema)).toThrow(
      expect.objectContaining({ kind: 'VALIDATION' }),
    );
  });

  it('lists schema issues so they can be fed back to the model', () => {
    try {
      parseStructured(
        JSON.stringify({ ...valid, complexity: 9, rationale: '' }),
        estimateTaskOutputSchema,
      );
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError);
      const issues = (error as LlmError).issues;
      expect(issues).toHaveLength(2);
      expect(issues[0]).toMatch(/^complexity: /);
    }
  });
});
