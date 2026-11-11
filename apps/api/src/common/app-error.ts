import { HttpStatus } from '@nestjs/common';

/** Typed domain error. The global filter turns it into the shared `ApiError` shape. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(resource: string): AppError {
    return new AppError('NOT_FOUND', `${resource} não encontrado(a)`, HttpStatus.NOT_FOUND);
  }

  static conflict(code: string, message: string, details?: unknown): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }

  static unauthenticated(message = 'Faça login para continuar.'): AppError {
    return new AppError('UNAUTHENTICATED', message, HttpStatus.UNAUTHORIZED);
  }

  static tooManyRequests(
    message = 'Muitas tentativas. Tente novamente em alguns minutos.',
  ): AppError {
    return new AppError('RATE_LIMITED', message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
