import type { Task as TaskRow } from '@prisma/client';
import type { Task } from '@routinely/shared';

/** Block minutes of a task in the active routine (see `TasksRepository.blockMinutes`). */
export interface TaskBlockMinutes {
  completed: number;
  scheduled: number;
}

export const NO_BLOCKS: TaskBlockMinutes = { completed: 0, scheduled: 0 };

export function toTaskDto(row: TaskRow, minutes: TaskBlockMinutes = NO_BLOCKS): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    deadline: row.deadline.toISOString(),
    commitmentId: row.commitmentId,
    status: row.status,
    complexity: row.complexity,
    estimatedMinutes: row.estimatedMinutes,
    splittable: row.splittable,
    aiRationale: row.aiRationale,
    estimationStatus: row.estimationStatus,
    estimationSource: row.estimationSource,
    completedMinutes: minutes.completed,
    scheduledMinutes: minutes.scheduled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
