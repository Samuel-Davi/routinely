import type { Task as TaskRow } from '@prisma/client';
import type { Task } from '@routinely/shared';

export function toTaskDto(row: TaskRow): Task {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
