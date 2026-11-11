/**
 * Port used by `TasksService` to request an asynchronous AI estimate. The real
 * implementation lives in the `ai` module; keeping it behind a token avoids a
 * hard dependency from tasks on the LLM layer.
 */
export interface EstimationQueue {
  enqueue(taskId: string): void;
}

export const ESTIMATION_QUEUE = Symbol('ESTIMATION_QUEUE');
