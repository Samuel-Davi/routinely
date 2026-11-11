import { z } from 'zod';
import { GRID_MINUTES } from '../time';
import { dateStringSchema, localDateTimeSchema } from './common';
import { MAX_ESTIMATED_MINUTES } from './task';

/** Structured output of the `estimateTask` use case. */
export const estimateTaskOutputSchema = z.object({
  complexity: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe('Complexidade de 1 (trivial) a 5 (muito difícil)'),
  estimatedMinutes: z
    .number()
    .int()
    .min(GRID_MINUTES)
    .max(MAX_ESTIMATED_MINUTES)
    .describe(`Tempo total de trabalho em minutos, múltiplo de ${GRID_MINUTES}`),
  splittable: z.boolean().describe('Se a tarefa pode ser dividida em mais de um bloco'),
  rationale: z.string().min(1).max(280).describe('Justificativa curta em português'),
});
export type EstimateTaskOutput = z.infer<typeof estimateTaskOutputSchema>;

export const routineAllocationSchema = z.object({
  taskId: z.string().min(1).describe('ID da tarefa, exatamente como recebido'),
  start: localDateTimeSchema.describe('Início no horário local, AAAA-MM-DDTHH:mm'),
  end: localDateTimeSchema.describe('Fim no horário local, AAAA-MM-DDTHH:mm'),
  rationale: z.string().max(200).describe('Por que este horário, em português'),
});
export type RoutineAllocation = z.infer<typeof routineAllocationSchema>;

/** Structured output of the `generateRoutine` use case. */
export const generateRoutineOutputSchema = z.object({
  allocations: z.array(routineAllocationSchema),
});
export type GenerateRoutineOutput = z.infer<typeof generateRoutineOutputSchema>;

/**
 * Structured output of the "order" strategies: the model decides the ORDER of the tasks and how
 * each one is split into blocks (minutes, optionally a preferred day); the backend picks the
 * exact times deterministically.
 */
export const orderedBlockSchema = z.object({
  minutes: z
    .number()
    .int()
    .min(GRID_MINUTES)
    .max(MAX_ESTIMATED_MINUTES)
    .describe(`Duração do bloco em minutos, múltiplo de ${GRID_MINUTES}`),
  day: dateStringSchema.optional().describe('Dia preferido (AAAA-MM-DD), opcional'),
});

export const orderedTaskSchema = z.object({
  taskId: z.string().min(1).describe('ID da tarefa, exatamente como recebido'),
  blocks: z.array(orderedBlockSchema).min(1).describe('Blocos da tarefa, em ordem'),
  rationale: z.string().max(200).describe('Por que esta ordem e divisão, em português'),
});

export const orderRoutineOutputSchema = z.object({
  plan: z.array(orderedTaskSchema).describe('Tarefas da mais importante para a menos importante'),
});
export type OrderRoutineOutput = z.infer<typeof orderRoutineOutputSchema>;
export type OrderedTask = z.infer<typeof orderedTaskSchema>;

export const AI_PLANNING_STRATEGIES = ['times', 'order', 'order-day'] as const;
export type AiPlanningStrategy = (typeof AI_PLANNING_STRATEGIES)[number];
