import { z } from 'zod';
import { GRID_MINUTES } from '../time';
import { localDateTimeSchema } from './common';
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
