import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiError } from '@routinely/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './app-error';

const HTTP_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

export function toApiError(exception: unknown): ApiError {
  if (exception instanceof AppError) {
    return {
      statusCode: exception.status,
      code: exception.code,
      message: exception.message,
      ...(exception.details === undefined ? {} : { details: exception.details }),
    };
  }
  if (exception instanceof ZodError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
    return {
      statusCode: HttpStatus.NOT_FOUND,
      code: 'NOT_FOUND',
      message: 'Registro não encontrado',
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      statusCode: status,
      code: HTTP_CODES[status] ?? 'HTTP_ERROR',
      message:
        status === HttpStatus.TOO_MANY_REQUESTS
          ? 'Muitas requisições. Tente novamente em instantes.'
          : exception.message,
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = toApiError(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
      );
    }
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }
}
