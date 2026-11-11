import {
  DEFAULT_PREFERENCES,
  type FixedCommitment,
  type Routine,
  type RoutineBlock,
  type Task,
} from '@routinely/shared';

let counter = 0;
/** Deterministic, valid UUIDs for fixtures. */
export const uuid = (seed?: number): string => {
  const value = seed ?? (counter += 1);
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
};

const stamp = '2026-11-09T10:00:00.000Z';

export const preferences = DEFAULT_PREFERENCES;

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: uuid(),
    title: 'Preparar apresentação',
    description: 'Slides para o cliente',
    priority: 'HIGH',
    deadline: '2026-11-13T22:00:00.000Z',
    commitmentId: null,
    status: 'TODO',
    complexity: 4,
    estimatedMinutes: 180,
    splittable: true,
    aiRationale: 'Exige pesquisa e revisão.',
    estimationStatus: 'DONE',
    estimationSource: 'AI',
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function makeCommitment(overrides: Partial<FixedCommitment> = {}): FixedCommitment {
  return {
    id: uuid(),
    title: 'Trabalho',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '12:00',
    category: 'WORK',
    color: 'blue',
    requiresTravel: false,
    overlapsWith: [],
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function makeBlock(overrides: Partial<RoutineBlock> = {}): RoutineBlock {
  const taskId = overrides.taskId ?? uuid();
  return {
    id: uuid(),
    routineId: uuid(900),
    taskId,
    // Monday 2026-11-09, 17:00–18:00 in America/Manaus
    start: '2026-11-09T21:00:00.000Z',
    end: '2026-11-09T22:00:00.000Z',
    locked: false,
    completedAt: null,
    rationale: 'Primeiro horário livre depois do trabalho.',
    task: {
      id: taskId,
      title: 'Preparar apresentação',
      priority: 'HIGH',
      status: 'SCHEDULED',
      deadline: '2026-11-13T22:00:00.000Z',
      commitmentId: null,
    },
    ...overrides,
  };
}

export function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  const blocks = overrides.blocks ?? [makeBlock()];
  return {
    id: uuid(900),
    version: 1,
    status: 'READY',
    source: 'AI',
    trigger: 'GENERATE',
    active: true,
    rangeStart: '2026-11-09',
    rangeEnd: '2026-11-15',
    diffSummary: { added: blocks.length, removed: 0, moved: 0, kept: 0 },
    unscheduled: [],
    notice: null,
    blockCount: blocks.length,
    createdAt: stamp,
    ...overrides,
    blocks,
  };
}
