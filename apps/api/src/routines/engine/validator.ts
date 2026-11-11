import {
  MINUTE_MS,
  ceilToGrid,
  checkPlacement,
  dayWindow,
  durationMinutes,
  roundToGrid,
  toLocalDateTime,
  type PlacementViolation,
} from '@routinely/shared';
import { PREFERRED_MIN_CHUNK_MINUTES } from './heuristic';
import type { EngineBlock, EngineTask, PlanningContext } from './types';

export type ValidationIssueCode =
  | PlacementViolation
  | 'UNKNOWN_TASK'
  | 'OUTSIDE_RANGE'
  | 'OVERLAPS_PROPOSED'
  | 'BREAK_TOO_SHORT'
  | 'NOT_SPLITTABLE'
  | 'FRAGMENTED'
  | 'WRONG_TOTAL'
  | 'MISSING';

export interface ValidationIssue {
  code: ValidationIssueCode;
  taskId: string;
  /** Portuguese, phrased so it can be sent back to the model. */
  message: string;
}

export interface ValidationResult {
  /** Blocks of the tasks that passed every rule (snapped to the grid, sorted). */
  accepted: EngineBlock[];
  acceptedTaskIds: string[];
  rejectedTaskIds: string[];
  issues: ValidationIssue[];
}

const PLACEMENT_MESSAGES: Record<PlacementViolation, string> = {
  INVALID_RANGE: 'tem início e fim inválidos',
  OFF_GRID: 'não está em múltiplos de 15 minutos',
  CROSSES_DAYS: 'atravessa mais de um dia',
  OUTSIDE_DAY_WINDOW: 'está fora da janela diária',
  OVERLAPS_LUNCH: 'invade o horário protegido de almoço/descanso',
  OVERLAPS_COMMITMENT: 'sobrepõe um compromisso fixo',
  OVERLAPS_BLOCK: 'sobrepõe um bloco travado',
  AFTER_DEADLINE: 'termina depois do prazo da tarefa',
  EXCEEDS_MAX_BLOCK: 'excede a duração máxima de um bloco de foco',
  IN_THE_PAST: 'começa no passado',
};

/**
 * Deterministic gatekeeper for AI proposals. It *adjusts* what is harmless
 * (snapping to the grid, ordering) and *rejects* — per task, all or nothing —
 * anything that overlaps a commitment, lunch or another block, leaves the daily
 * window or planning range, breaks the deadline, exceeds the max block, ignores
 * the minimum break, splits an unsplittable task or allocates a total different
 * from the estimate.
 */
export function validateAllocations(
  proposed: readonly EngineBlock[],
  tasks: readonly EngineTask[],
  context: PlanningContext,
): ValidationResult {
  const { prefs } = context;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const issues: ValidationIssue[] = [];
  const rejected = new Set<string>();
  const label = (block: EngineBlock) =>
    `${toLocalDateTime(block.start, prefs.timezone)}–${toLocalDateTime(block.end, prefs.timezone).slice(11)}`;
  const reject = (code: ValidationIssueCode, taskId: string, message: string) => {
    issues.push({ code, taskId, message });
    rejected.add(taskId);
  };

  // Adjust: snap to the grid and order chronologically.
  const blocks = proposed
    .map((block) => ({ ...block, start: roundToGrid(block.start), end: roundToGrid(block.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const earliest = ceilToGrid(context.now);
  const rangeStart = dayWindow(context.rangeStart, prefs).start;
  const rangeEnd = dayWindow(context.rangeEnd, prefs).end;

  // 1. Each block on its own.
  for (const block of blocks) {
    const task = taskById.get(block.taskId);
    if (!task) {
      reject(
        'UNKNOWN_TASK',
        block.taskId,
        `Bloco ${label(block)} referencia uma tarefa inexistente.`,
      );
      continue;
    }
    const violations = checkPlacement(block, {
      prefs,
      commitments: context.commitments,
      otherBlocks: context.fixedBlocks,
      deadline: task.deadline,
    });
    for (const violation of violations) {
      reject(
        violation,
        task.id,
        `"${task.title}": o bloco ${label(block)} ${PLACEMENT_MESSAGES[violation]}.`,
      );
    }
    if (violations.includes('INVALID_RANGE')) continue;
    if (block.start < earliest) {
      reject('IN_THE_PAST', task.id, `"${task.title}": o bloco ${label(block)} começa no passado.`);
    }
    if (block.start < rangeStart || block.end > rangeEnd) {
      reject(
        'OUTSIDE_RANGE',
        task.id,
        `"${task.title}": o bloco ${label(block)} está fora do período planejado.`,
      );
    }
  }

  // 2. Each task as a whole.
  for (const task of tasks) {
    const own = blocks.filter((block) => block.taskId === task.id);
    if (own.length === 0) {
      reject('MISSING', task.id, `"${task.title}": faltou alocar os ${task.minutes} minutos.`);
      continue;
    }
    if (rejected.has(task.id)) continue;
    const total = own.reduce((sum, block) => sum + durationMinutes(block), 0);
    if (total !== task.minutes) {
      reject(
        'WRONG_TOTAL',
        task.id,
        `"${task.title}": foram alocados ${total} minutos, mas a tarefa precisa de exatamente ${task.minutes}.`,
      );
    }
    const crumb = own.find((block) => durationMinutes(block) < PREFERRED_MIN_CHUNK_MINUTES);
    if (crumb && own.length > 1) {
      reject(
        'FRAGMENTED',
        task.id,
        `"${task.title}": o bloco ${label(crumb)} tem menos de ${PREFERRED_MIN_CHUNK_MINUTES} minutos; junte-o a outro bloco da tarefa.`,
      );
    }
    if (!task.splittable && own.length > 1) {
      reject(
        'NOT_SPLITTABLE',
        task.id,
        `"${task.title}": não é divisível e foi partida em ${own.length} blocos.`,
      );
    }
  }

  // 3. Blocks against each other, earliest first; the later block's task loses.
  const minBreak = prefs.minBreakMinutes * MINUTE_MS;
  const kept: EngineBlock[] = [];
  for (const block of blocks) {
    if (rejected.has(block.taskId)) continue;
    const task = taskById.get(block.taskId) as EngineTask;
    const clash = kept.find(
      (other) => !rejected.has(other.taskId) && block.start < other.end + minBreak,
    );
    if (clash) {
      const overlapping = block.start < clash.end;
      reject(
        overlapping ? 'OVERLAPS_PROPOSED' : 'BREAK_TOO_SHORT',
        task.id,
        overlapping
          ? `"${task.title}": o bloco ${label(block)} sobrepõe outro bloco proposto (${label(clash)}).`
          : `"${task.title}": o bloco ${label(block)} não respeita o intervalo mínimo de ${prefs.minBreakMinutes} minutos após ${label(clash)}.`,
      );
      continue;
    }
    const neighbour = context.fixedBlocks.find(
      (fixed) => block.start < fixed.end + minBreak && fixed.start < block.end + minBreak,
    );
    if (neighbour) {
      reject(
        'BREAK_TOO_SHORT',
        task.id,
        `"${task.title}": o bloco ${label(block)} não respeita o intervalo mínimo de ${prefs.minBreakMinutes} minutos em relação a um bloco travado.`,
      );
      continue;
    }
    kept.push(block);
  }

  const accepted = kept.filter((block) => !rejected.has(block.taskId));
  const acceptedTaskIds = [...new Set(accepted.map((block) => block.taskId))];
  return { accepted, acceptedTaskIds, rejectedTaskIds: [...rejected], issues };
}
