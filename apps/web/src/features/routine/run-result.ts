import type { Routine } from '@routinely/shared';

/**
 * What a generation or replan changed, compared block by block with the version it replaced.
 * A task with no block before is "added"; a task whose block sits at a new time is "moved";
 * a block at exactly the same place is "kept". Blocks get new ids per version, so tasks and
 * times are what identify them across versions.
 */
export interface RunResult {
  routineId: string;
  /** The version a "Desfazer" restores; null on the first generation. */
  previousRoutineId: string | null;
  /** Blocks of the new version that were added or moved: the ones the grid highlights. */
  changedBlockIds: string[];
  total: number;
  added: number;
  moved: number;
  kept: number;
}

const slotKey = (start: string, end: string) => `${start}|${end}`;

export function compareRuns(previous: Routine | null, next: Routine): RunResult {
  const before = new Map<string, Set<string>>();
  for (const block of previous?.blocks ?? []) {
    const slots = before.get(block.taskId) ?? new Set<string>();
    slots.add(slotKey(block.start, block.end));
    before.set(block.taskId, slots);
  }

  const changedBlockIds: string[] = [];
  let added = 0;
  let moved = 0;
  let kept = 0;
  for (const block of next.blocks) {
    const slots = before.get(block.taskId);
    if (!slots) {
      added += 1;
      changedBlockIds.push(block.id);
    } else if (slots.has(slotKey(block.start, block.end))) {
      kept += 1;
    } else {
      moved += 1;
      changedBlockIds.push(block.id);
    }
  }

  return {
    routineId: next.id,
    previousRoutineId: previous && previous.id !== next.id ? previous.id : null,
    changedBlockIds,
    total: next.blocks.length,
    added,
    moved,
    kept,
  };
}

/** "13 blocos · 4 novos · 2 movidos": only the parts that are not zero. */
export function describeRun(result: RunResult): string {
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  return [
    plural(result.total, 'bloco', 'blocos'),
    result.added > 0 ? plural(result.added, 'novo', 'novos') : null,
    result.moved > 0 ? plural(result.moved, 'movido', 'movidos') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
