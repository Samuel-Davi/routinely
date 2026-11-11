import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_PREFERENCES,
  createTaskSchema,
  estimateTaskOutputSchema,
  fixedCommitmentInputSchema,
  generateRoutineInputSchema,
  generateRoutineOutputSchema,
  moveBlockSchema,
  preferencesSchema,
  updateTaskSchema,
  loginSchema,
  quickInstructionSchema,
  registerSchema,
} from '../index';

const commitment = {
  title: 'Aula de inglês',
  daysOfWeek: [1, 3],
  startTime: '19:00',
  endTime: '20:30',
  category: 'STUDY',
  color: 'blue',
};

describe('fixedCommitmentInputSchema', () => {
  it('accepts a valid commitment', () => {
    expect(fixedCommitmentInputSchema.parse(commitment)).toEqual({
      ...commitment,
      requiresTravel: false,
    });
    expect(
      fixedCommitmentInputSchema.parse({ ...commitment, requiresTravel: true }).requiresTravel,
    ).toBe(true);
  });

  it.each([
    ['empty title', { title: '  ' }],
    ['no days', { daysOfWeek: [] }],
    ['repeated days', { daysOfWeek: [1, 1] }],
    ['day out of range', { daysOfWeek: [7] }],
    ['end before start', { endTime: '18:00' }],
    ['bad time', { startTime: '7pm' }],
    ['unknown color', { color: 'magenta' }],
  ])('rejects %s', (_label, patch) => {
    expect(fixedCommitmentInputSchema.safeParse({ ...commitment, ...patch }).success).toBe(false);
  });
});

describe('task schemas', () => {
  const task = { title: 'Relatório', priority: 'HIGH', deadline: '2026-11-13T22:00:00.000Z' };

  it('defaults the description and trims the title', () => {
    expect(createTaskSchema.parse({ ...task, title: ' Relatório ' })).toEqual({
      ...task,
      description: '',
    });
  });

  it('accepts deadlines with an offset', () => {
    expect(
      createTaskSchema.safeParse({ ...task, deadline: '2026-11-13T18:00:00-04:00' }).success,
    ).toBe(true);
    expect(createTaskSchema.safeParse({ ...task, deadline: '13/11/2026' }).success).toBe(false);
  });

  it('validates partial updates and the manual estimate override', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ status: 'DONE' }).success).toBe(true);
    expect(
      updateTaskSchema.safeParse({
        estimate: { complexity: 3, estimatedMinutes: 90, splittable: true },
      }).success,
    ).toBe(true);
    expect(
      updateTaskSchema.safeParse({
        estimate: { complexity: 6, estimatedMinutes: 50, splittable: true },
      }).success,
    ).toBe(false);
  });
});

describe('preferencesSchema', () => {
  it('accepts the defaults', () => {
    expect(preferencesSchema.parse(DEFAULT_PREFERENCES)).toEqual(DEFAULT_PREFERENCES);
  });

  it.each([
    ['inverted day', { dayStart: '22:00', dayEnd: '07:00' }],
    ['inverted lunch', { lunchStart: '13:00', lunchEnd: '12:00' }],
    ['block off grid', { maxFocusBlockMinutes: 50 }],
    ['block too long', { maxFocusBlockMinutes: 300 }],
    ['bad timezone', { timezone: 'Nowhere/City' }],
  ])('rejects %s', (_label, patch) => {
    expect(preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, ...patch }).success).toBe(false);
  });
});

describe('routine inputs', () => {
  it('defaults untilLastDeadline to false', () => {
    expect(generateRoutineInputSchema.parse({})).toEqual({ untilLastDeadline: false });
  });

  it('requires end after start when moving a block', () => {
    const start = '2026-11-10T14:00:00.000Z';
    expect(moveBlockSchema.safeParse({ start, end: start }).success).toBe(false);
    expect(moveBlockSchema.safeParse({ start, end: '2026-11-10T15:00:00.000Z' }).success).toBe(
      true,
    );
  });
});

describe('AI output schemas', () => {
  it('validates the task estimate', () => {
    const estimate = { complexity: 3, estimatedMinutes: 120, splittable: true, rationale: 'ok' };
    expect(estimateTaskOutputSchema.parse(estimate)).toEqual(estimate);
    expect(estimateTaskOutputSchema.safeParse({ ...estimate, complexity: 0 }).success).toBe(false);
    expect(estimateTaskOutputSchema.safeParse({ ...estimate, rationale: '' }).success).toBe(false);
  });

  it('validates routine allocations in local time', () => {
    const allocation = {
      taskId: 't1',
      start: '2026-11-10T14:00',
      end: '2026-11-10T15:00',
      rationale: '',
    };
    expect(generateRoutineOutputSchema.safeParse({ allocations: [allocation] }).success).toBe(true);
    expect(
      generateRoutineOutputSchema.safeParse({
        allocations: [{ ...allocation, start: '2026-11-10T14:00:00Z' }],
      }).success,
    ).toBe(false);
  });

  it('converts to JSON Schema for the LLM', () => {
    const schema = z.toJSONSchema(generateRoutineOutputSchema) as { properties: object };
    expect(Object.keys(schema.properties)).toEqual(['allocations']);
  });
});

describe('quickInstructionSchema', () => {
  it('accepts empty text and a normal instruction', () => {
    expect(quickInstructionSchema.parse('')).toBe('');
    expect(quickInstructionSchema.parse('  priorize   Web Academy ')).toBe('priorize Web Academy');
  });

  it('strips control characters and markup', () => {
    expect(quickInstructionSchema.parse('sem trabalho\u0000 no <b>domingo</b>\n```x```')).toBe(
      'sem trabalho no bdomingo/b x',
    );
    expect(quickInstructionSchema.parse('# manhãs livres {{x}} [y]')).toBe('manhãs livres x y');
  });

  it('rejects more than 40 words', () => {
    const forty = Array.from({ length: 40 }, () => 'a').join(' ');
    expect(quickInstructionSchema.safeParse(forty).success).toBe(true);
    expect(quickInstructionSchema.safeParse(`${forty} a`).success).toBe(false);
  });

  it('rejects more than 280 characters even with few words', () => {
    expect(quickInstructionSchema.safeParse('a'.repeat(280)).success).toBe(true);
    expect(quickInstructionSchema.safeParse('a'.repeat(281)).success).toBe(false);
  });

  it('is optional in the generate input and rejects oversized raw text', () => {
    expect(generateRoutineInputSchema.parse({}).instruction).toBeUndefined();
    expect(generateRoutineInputSchema.safeParse({ instruction: 'x'.repeat(5000) }).success).toBe(
      false,
    );
  });
});

describe('auth schemas', () => {
  it('normalizes the e-mail and enforces password strength', () => {
    const ok = registerSchema.parse({ email: '  Ana@Example.COM ', password: 'cavalo-azul-42' });
    expect(ok.email).toBe('ana@example.com');
    for (const password of [
      'curta1',
      'somenteletrasaqui',
      '1234567890',
      'aaaaaaaaaa1',
      'Password123',
    ]) {
      expect(registerSchema.safeParse({ email: 'a@b.co', password }).success).toBe(false);
    }
    expect(
      registerSchema.safeParse({ email: 'not-an-email', password: 'cavalo-azul-42' }).success,
    ).toBe(false);
  });

  it('does not re-check strength at login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
