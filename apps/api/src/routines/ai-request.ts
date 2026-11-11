import { fromLocalDateTime, toLocalDateTime, type AiPlanningStrategy } from '@routinely/shared';
import type { RoutinePlanningInput, RoutineProposer } from '../ai/generate-routine';
import {
  computeFreeWindows,
  placeByOrder,
  type EngineTask,
  type PlanningContext,
  type ProposeFn,
} from './engine';

/**
 * Builds the compact LLM request for a set of tasks: local time strings in, short aliases and
 * no previous rationale. Shared by the routines service and the `eval:ai` harness.
 */
export function buildPlanningInput(
  context: PlanningContext,
  titles: ReadonlyMap<string, string>,
  commitmentOfTask: ReadonlyMap<string, string>,
  instruction?: string,
): (tasks: readonly EngineTask[]) => RoutinePlanningInput {
  const { prefs } = context;
  const local = (instant: number) => toLocalDateTime(instant, prefs.timezone);
  return (tasks) => ({
    timezone: prefs.timezone,
    now: local(context.now),
    maxFocusBlockMinutes: prefs.maxFocusBlockMinutes,
    minBreakMinutes: prefs.minBreakMinutes,
    freeWindows: computeFreeWindows(context).map((window) => ({
      start: local(window.start),
      end: local(window.end),
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      deadline: local(task.deadline),
      complexity: task.complexity,
      minutes: task.minutes,
      splittable: task.splittable,
      commitment: commitmentOfTask.get(task.id),
    })),
    lockedBlocks: context.fixedBlocks
      .filter((block) => block.end > context.now)
      .map((block) => ({
        title: titles.get(block.taskId) ?? 'Tarefa',
        start: local(block.start),
        end: local(block.end),
      })),
    instruction,
  });
}

/** Adapts the engine's request to the configured AI strategy (instants out). */
export function buildProposeFn(
  strategy: AiPlanningStrategy,
  proposer: Pick<RoutineProposer, 'propose' | 'proposeOrder'>,
  context: PlanningContext,
  buildInput: (tasks: readonly EngineTask[]) => RoutinePlanningInput,
): ProposeFn {
  const { prefs } = context;
  return async ({ tasks, tier, feedback }) => {
    const input = { ...buildInput(tasks), feedback, tier };
    if (strategy !== 'times') {
      // The model decides order and split; the backend picks the exact times.
      const plan = await proposer.proposeOrder(input, strategy === 'order-day');
      return placeByOrder(plan, tasks, context);
    }
    const allocations = await proposer.propose(input);
    return allocations.map((allocation) => ({
      taskId: allocation.taskId,
      start: fromLocalDateTime(allocation.start, prefs.timezone),
      end: fromLocalDateTime(allocation.end, prefs.timezone),
      rationale: allocation.rationale || null,
    }));
  };
}
