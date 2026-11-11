import { apiErrorSchema, type ApiError } from '@routinely/shared';
import type { z } from 'zod';
import { env } from './env';

/** Every failed request surfaces as this error, with the API's typed code. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = error.statusCode;
    this.code = error.code;
    this.details = error.details;
  }
}

export const isApiError = (error: unknown, code?: string): error is ApiRequestError =>
  error instanceof ApiRequestError && (code === undefined || error.code === code);

/** Message safe to show to the user for any thrown value. */
export function errorMessage(
  error: unknown,
  fallback = 'Algo deu errado. Tente novamente.',
): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

interface RequestOptions<TSchema extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Response schema. Responses are validated, so callers get real types, not casts. */
  schema?: TSchema;
  signal?: AbortSignal;
}

type Result<TSchema> = TSchema extends z.ZodType ? z.output<TSchema> : void;

/**
 * The single HTTP entry point of the app. It serialises JSON, validates the
 * response with a shared zod schema and normalises every failure (network,
 * HTTP, malformed payload) into an `ApiRequestError`.
 */
export async function apiRequest<TSchema extends z.ZodType | undefined = undefined>(
  path: string,
  options: RequestOptions<TSchema> = {},
): Promise<Result<TSchema>> {
  const { method = 'GET', body, schema, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    // A cancelled request (e.g. a superseded query) is not a failure to report.
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiRequestError({
      statusCode: 0,
      code: 'NETWORK_ERROR',
      message: 'Não foi possível conectar ao servidor. Verifique sua conexão.',
    });
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiRequestError(
      parsed.success
        ? parsed.data
        : {
            statusCode: response.status,
            code: 'HTTP_ERROR',
            message: 'O servidor respondeu com um erro inesperado.',
          },
    );
  }

  if (!schema) return undefined as Result<TSchema>;
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiRequestError({
      statusCode: response.status,
      code: 'INVALID_RESPONSE',
      message: 'O servidor enviou uma resposta em formato inesperado.',
      details: parsed.error.issues,
    });
  }
  return parsed.data as Result<TSchema>;
}
