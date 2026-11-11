import type {
  Routine,
  RoutineBlock,
  RoutineDiff,
  RoutineSummary,
  UnscheduledTask,
} from '@routinely/shared';
import type { BlockWithTask, RoutineWithBlocks, RoutineWithCount } from './routines.repository';

export function toBlockDto(block: BlockWithTask): RoutineBlock {
  return {
    id: block.id,
    routineId: block.routineId,
    taskId: block.taskId,
    start: block.start.toISOString(),
    end: block.end.toISOString(),
    locked: block.locked,
    completedAt: block.completedAt?.toISOString() ?? null,
    rationale: block.rationale,
    task: {
      id: block.task.id,
      title: block.task.title,
      priority: block.task.priority,
      status: block.task.status,
      deadline: block.task.deadline.toISOString(),
    },
  };
}

function toSummary(
  routine: RoutineWithBlocks | RoutineWithCount,
  blockCount: number,
): RoutineSummary {
  return {
    id: routine.id,
    version: routine.version,
    status: routine.status,
    source: routine.source,
    trigger: routine.trigger,
    active: routine.active,
    rangeStart: routine.rangeStart,
    rangeEnd: routine.rangeEnd,
    diffSummary: (routine.diffSummary as RoutineDiff | null) ?? null,
    unscheduled: (routine.unscheduled as UnscheduledTask[] | null) ?? [],
    notice: routine.notice,
    blockCount,
    createdAt: routine.createdAt.toISOString(),
  };
}

export const toRoutineSummaryDto = (routine: RoutineWithCount): RoutineSummary =>
  toSummary(routine, routine._count.blocks);

export const toRoutineDto = (routine: RoutineWithBlocks): Routine => ({
  ...toSummary(routine, routine.blocks.length),
  blocks: routine.blocks.map(toBlockDto),
});
