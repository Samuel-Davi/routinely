import type { Interval, RoutineDiff } from '@routinely/shared';

type DiffBlock = Interval & { taskId: string };

const keyOf = (block: DiffBlock) => `${block.taskId}|${block.start}|${block.end}`;

/**
 * Summarises what changed between two routine versions. A block of the same task
 * that only changed time counts as `moved`; surplus blocks are `added`/`removed`.
 */
export function diffBlocks(
  previous: readonly DiffBlock[],
  next: readonly DiffBlock[],
): RoutineDiff {
  const previousKeys = new Map<string, number>();
  for (const block of previous)
    previousKeys.set(keyOf(block), (previousKeys.get(keyOf(block)) ?? 0) + 1);

  let kept = 0;
  const changedNext = new Map<string, number>();
  for (const block of next) {
    const count = previousKeys.get(keyOf(block)) ?? 0;
    if (count > 0) {
      previousKeys.set(keyOf(block), count - 1);
      kept += 1;
    } else {
      changedNext.set(block.taskId, (changedNext.get(block.taskId) ?? 0) + 1);
    }
  }

  const changedPrevious = new Map<string, number>();
  for (const [key, count] of previousKeys) {
    if (count === 0) continue;
    const taskId = key.slice(0, key.indexOf('|'));
    changedPrevious.set(taskId, (changedPrevious.get(taskId) ?? 0) + count);
  }

  let moved = 0;
  let added = 0;
  let removed = 0;
  for (const taskId of new Set([...changedPrevious.keys(), ...changedNext.keys()])) {
    const before = changedPrevious.get(taskId) ?? 0;
    const after = changedNext.get(taskId) ?? 0;
    const pairs = Math.min(before, after);
    moved += pairs;
    added += after - pairs;
    removed += before - pairs;
  }
  return { added, removed, moved, kept };
}
