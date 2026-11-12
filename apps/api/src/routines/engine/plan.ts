import { durationMinutes } from '@routinely/shared';
import { scheduleHeuristic } from './heuristic';
import type {
  EngineBlock,
  EngineTask,
  EngineUnscheduled,
  PlanResult,
  PlanningContext,
} from './types';
import { validateAllocations, type ValidationResult } from './validator';

export interface ProposalRequest {
  /** Only the tasks that can possibly fit; impossible ones never reach the model. */
  tasks: EngineTask[];
  /** `retry` = second attempt, on the stronger model, with the validator's feedback. */
  tier: 'default' | 'retry';
  feedback?: string[];
}

/** The AI side of the pipeline. Rejects with an error carrying a `kind` when unavailable. */
export type ProposeFn = (request: ProposalRequest) => Promise<EngineBlock[]>;

export interface PlanInput {
  tasks: readonly EngineTask[];
  context: PlanningContext;
  /** Omit to plan with the heuristic only (e.g. no API key). */
  propose?: ProposeFn;
}

const NOTICES: Record<string, string> = {
  RATE_LIMIT: 'A IA atingiu o limite de uso. Rotina gerada sem IA.',
  TIMEOUT: 'A IA demorou demais para responder. Rotina gerada sem IA.',
  VALIDATION: 'A IA devolveu uma resposta inválida. Rotina gerada sem IA.',
  OVERLOADED: 'A IA está sobrecarregada no momento. Rotina gerada sem IA.',
  UNAVAILABLE: 'IA indisponível ou não configurada. Rotina gerada sem IA.',
};
const GENERIC_NOTICE = 'Não foi possível usar a IA. Rotina gerada sem IA.';
export const NOT_CONFIGURED_NOTICE = 'IA não configurada. Rotina gerada sem IA.';
export const REPAIRED_NOTICE =
  'Parte da proposta da IA era inválida e foi corrigida automaticamente.';
export const INVALID_PROPOSAL_NOTICE =
  'A proposta da IA não passou na validação. Rotina gerada sem IA.';

const acceptedMinutes = (result: ValidationResult) =>
  result.accepted.reduce((sum, block) => sum + durationMinutes(block), 0);

/**
 * The AI proposes; the backend validates.
 *
 *  1. Tasks are classified up front: those that fit whole go to the AI; those that fit only in
 *     part ("squeezed") skip the AI (it must give exact totals) and are placed by the
 *     heuristic with whatever time exists, flagged as shortfalls; those with no usable time at
 *     all are reported as unscheduled.
 *  2. The model proposes; the validator keeps only fully valid tasks.
 *  3. On any issue, one retry with the stronger model and the list of problems.
 *  4. Whatever is still unplaced goes to the deterministic first-fit heuristic.
 *
 * The result is always a valid routine, even with no AI at all.
 */
export async function planRoutine({ tasks, context, propose }: PlanInput): Promise<PlanResult> {
  const pending = tasks.filter((task) => task.minutes > 0);

  // 1. Feasibility: what fits whole, what fits only in part, and what cannot be scheduled at all.
  const impossible: EngineUnscheduled[] = [];
  const feasible: EngineTask[] = [];
  const squeezed: EngineTask[] = [];
  for (const task of pending) {
    const alone = scheduleHeuristic([task], context);
    if (alone.unscheduled[0]) impossible.push(alone.unscheduled[0]);
    else if (alone.shortfalls.length > 0) squeezed.push(task);
    else feasible.push(task);
  }

  const finish = (
    accepted: EngineBlock[],
    acceptedTaskIds: readonly string[],
    aiWasFlawless: boolean,
    fallbackNotice: string,
  ): PlanResult => {
    const rest = [...feasible.filter((task) => !acceptedTaskIds.includes(task.id)), ...squeezed];
    const heuristic = scheduleHeuristic(rest, context, accepted);
    const blocks = [...accepted, ...heuristic.blocks].sort((a, b) => a.start - b.start);
    const unscheduled = [...impossible, ...heuristic.unscheduled];
    const shortfalls = heuristic.shortfalls;
    if (accepted.length === 0) {
      return { blocks, unscheduled, shortfalls, source: 'HEURISTIC', notice: fallbackNotice };
    }
    return aiWasFlawless
      ? { blocks, unscheduled, shortfalls, source: 'AI', notice: null }
      : { blocks, unscheduled, shortfalls, source: 'AI_REPAIRED', notice: REPAIRED_NOTICE };
  };

  if (feasible.length === 0) {
    // Nothing for the AI to propose: only partial placements (if any) remain.
    const heuristic = scheduleHeuristic(squeezed, context);
    return {
      blocks: heuristic.blocks,
      unscheduled: [...impossible, ...heuristic.unscheduled],
      shortfalls: heuristic.shortfalls,
      source: propose ? 'AI' : 'HEURISTIC',
      notice: null,
    };
  }
  if (!propose) return finish([], [], false, NOT_CONFIGURED_NOTICE);

  // 2. First proposal.
  let best: ValidationResult;
  try {
    best = validateAllocations(
      await propose({ tasks: feasible, tier: 'default' }),
      feasible,
      context,
    );
  } catch (error) {
    const kind = (error as { kind?: string } | null)?.kind;
    return finish([], [], false, (kind && NOTICES[kind]) || GENERIC_NOTICE);
  }

  // 3. One retry with feedback when the validator found anything.
  if (best.issues.length > 0) {
    try {
      const retried = validateAllocations(
        await propose({
          tasks: feasible,
          tier: 'retry',
          feedback: best.issues.map((issue) => issue.message),
        }),
        feasible,
        context,
      );
      if (
        acceptedMinutes(retried) > acceptedMinutes(best) ||
        (acceptedMinutes(retried) === acceptedMinutes(best) &&
          retried.issues.length < best.issues.length)
      ) {
        best = retried;
      }
    } catch {
      // Keep whatever the first proposal got right.
    }
  }

  // 4. Heuristic completes the rest.
  return finish(
    best.accepted,
    best.acceptedTaskIds,
    best.issues.length === 0,
    INVALID_PROPOSAL_NOTICE,
  );
}
