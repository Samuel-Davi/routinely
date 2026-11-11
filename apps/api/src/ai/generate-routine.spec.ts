import type { AppConfig } from '../config/config.module';
import { FakeLlmProvider } from '../testing/fake-llm-provider';
import { RoutineProposer, formatFreeWindows, type RoutinePlanningInput } from './generate-routine';
import { LlmClient } from './llm-client';

const input: RoutinePlanningInput = {
  timezone: 'America/Manaus',
  now: '2026-11-09T06:00',
  maxFocusBlockMinutes: 90,
  minBreakMinutes: 15,
  freeWindows: [
    { start: '2026-11-09T07:00', end: '2026-11-09T08:00' },
    { start: '2026-11-09T19:00', end: '2026-11-09T22:00' },
    { start: '2026-11-10T07:00', end: '2026-11-10T08:00' },
  ],
  tasks: [
    {
      id: 'uuid-a',
      title: 'Estudar "cálculo"',
      priority: 'HIGH',
      deadline: '2026-11-10T22:00',
      complexity: 4,
      minutes: 90,
      splittable: true,
    },
    {
      id: 'uuid-b',
      title: 'Agendar dentista',
      priority: 'LOW',
      deadline: '2026-11-13T18:00',
      complexity: 1,
      minutes: 15,
      splittable: false,
    },
  ],
  lockedBlocks: [{ title: 'Revisão', start: '2026-11-09T20:30', end: '2026-11-09T21:00' }],
};

function setup() {
  const provider = new FakeLlmProvider();
  const client = new LlmClient(
    provider,
    { LLM_MAX_ATTEMPTS: 1, LLM_BACKOFF_BASE_MS: 0 } as AppConfig,
    { sleep: async () => undefined, random: () => 0 },
  );
  return { provider, proposer: new RoutineProposer(client) };
}

describe('formatFreeWindows', () => {
  it('groups windows by day with the weekday in Portuguese', () => {
    expect(formatFreeWindows(input.freeWindows)).toBe(
      '2026-11-09 (segunda): 07:00–08:00, 19:00–22:00\n2026-11-10 (terça): 07:00–08:00',
    );
    expect(formatFreeWindows([])).toBe('(nenhuma janela livre)');
  });
});

describe('RoutineProposer', () => {
  it('builds a prompt with aliases instead of UUIDs', () => {
    const { proposer } = setup();
    const { prompt, aliases } = proposer.buildPrompt(input);
    expect(prompt).toContain(
      `T1 | "Estudar 'cálculo'" | prioridade HIGH | prazo 2026-11-10T22:00 | complexidade 4 | 90 min | divisível: sim`,
    );
    expect(prompt).toContain('T2 | "Agendar dentista"');
    expect(prompt).toContain('bloco máximo 90 min; intervalo mínimo 15 min');
    expect(prompt).toContain('"Revisão": 2026-11-09T20:30 → 2026-11-09T21:00');
    expect(prompt).not.toContain('uuid-a');
    expect([...aliases.entries()]).toEqual([
      ['T1', 'uuid-a'],
      ['T2', 'uuid-b'],
    ]);
  });

  it('adds the related commitment to a task line only when linked', () => {
    const { proposer } = setup();
    const { prompt } = proposer.buildPrompt({
      ...input,
      tasks: input.tasks.map((task, index) =>
        index === 0 ? { ...task, commitment: 'Aula de "Ética"' } : task,
      ),
    });
    expect(prompt).toContain('relacionada a "');
    expect(prompt.match(/relacionada a/g)).toHaveLength(1);
  });

  it('says so when there are no locked blocks and appends validator feedback', () => {
    const { proposer } = setup();
    const { prompt } = proposer.buildPrompt({
      ...input,
      lockedBlocks: [],
      feedback: ['T1: passa do prazo'],
    });
    expect(prompt).toContain('(nenhum)');
    expect(prompt).toContain('rejeitada pelo validador');
    expect(prompt).toContain('- T1: passa do prazo');
  });

  it('maps aliases back to task ids', async () => {
    const { proposer, provider } = setup();
    provider.reply({
      allocations: [
        {
          taskId: 'T1',
          start: '2026-11-09T19:00',
          end: '2026-11-09T20:30',
          rationale: 'Primeiro horário.',
        },
        { taskId: 'T2', start: '2026-11-10T07:00', end: '2026-11-10T07:15', rationale: 'Rápida.' },
      ],
    });
    const allocations = await proposer.propose({ ...input, tier: 'retry' });
    expect(allocations.map((allocation) => allocation.taskId)).toEqual(['uuid-a', 'uuid-b']);
    expect(provider.calls[0]?.tier).toBe('retry');
    expect(provider.calls[0]?.system).toContain('planejador de rotina');
  });

  it('rejects allocations for tasks that were not in the prompt', async () => {
    const { proposer, provider } = setup();
    provider.reply({
      allocations: [
        { taskId: 'T9', start: '2026-11-09T19:00', end: '2026-11-09T20:00', rationale: '' },
      ],
    });
    await expect(proposer.propose(input)).rejects.toMatchObject({
      kind: 'VALIDATION',
      issues: ['taskId desconhecido: T9'],
    });
  });

  it('skips the LLM when there is nothing to plan', async () => {
    const { proposer, provider } = setup();
    await expect(proposer.propose({ ...input, tasks: [] })).resolves.toEqual([]);
    expect(provider.calls).toHaveLength(0);
  });

  it('reports availability from the provider', () => {
    const { proposer, provider } = setup();
    expect(proposer.isAvailable()).toBe(true);
    provider.configured = false;
    expect(proposer.isAvailable()).toBe(false);
  });
});
