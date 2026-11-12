/**
 * Max-min fair split of scarce time among tasks that share a priority.
 *
 * Tasks compete for free time, but each can only use time before its own deadline: the sets of
 * time a task may use are nested (earlier deadline ⊂ later deadline). Feasibility is then the
 * classic prefix condition: for every deadline, the targets of the tasks due by then must fit in
 * the capacity available by then.
 *
 * Progressive filling: raise every task's completion ratio (target / need) together; when a
 * prefix becomes full, the tasks inside it stop growing (they cannot get more without taking
 * from tasks that can only use that time), and the others keep growing. The result gives each
 * task the same share of what it needs, except where its deadline limits it.
 */
export interface FairShareTask {
  /** Minutes the task needs in total. */
  need: number;
  /** Index (0-based, ascending) of the task's deadline among the distinct deadlines. */
  deadlineIndex: number;
}

const EPSILON = 1e-6;

/**
 * @param tasks tasks with their need and deadline index
 * @param capacity minutes of usable time in each deadline segment (segment k = time after
 *                 deadline k-1 up to deadline k), length = number of distinct deadlines
 * @returns the target minutes of each task (same order as `tasks`), never above its need
 */
export function fairTargets(
  tasks: readonly FairShareTask[],
  capacity: readonly number[],
): number[] {
  const cumulative = capacity.reduce<number[]>((sums, minutes) => {
    sums.push((sums.at(-1) ?? 0) + minutes);
    return sums;
  }, []);
  const targets = tasks.map(() => 0);
  const frozen = tasks.map(() => false);

  /** Total target of the tasks due by deadline `k`, with the active ones at ratio `lambda`. */
  const usage = (k: number, lambda: number) =>
    tasks.reduce(
      (sum, task, index) =>
        task.deadlineIndex > k
          ? sum
          : sum + (frozen[index] ? (targets[index] as number) : lambda * task.need),
      0,
    );
  const fits = (lambda: number) => cumulative.every((cap, k) => usage(k, lambda) <= cap + EPSILON);

  while (frozen.includes(false)) {
    if (fits(1)) {
      tasks.forEach((task, index) => {
        if (!frozen[index]) targets[index] = task.need;
      });
      break;
    }
    let low = 0;
    let high = 1;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    // The first full prefix freezes the tasks it contains; the rest keep growing.
    const full = cumulative.findIndex(
      (cap, k) =>
        usage(k, low) >= cap - EPSILON &&
        tasks.some((task, index) => !frozen[index] && task.deadlineIndex <= k),
    );
    tasks.forEach((task, index) => {
      if (!frozen[index] && (full === -1 || task.deadlineIndex <= full)) {
        targets[index] = low * task.need;
        frozen[index] = true;
      }
    });
  }
  return targets;
}
