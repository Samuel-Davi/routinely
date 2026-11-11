import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { toApiError } from './all-exceptions.filter';
import { AppError } from './app-error';

describe('toApiError', () => {
  it('maps domain errors', () => {
    expect(toApiError(AppError.notFound('Tarefa'))).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Tarefa não encontrado(a)',
    });
    expect(
      toApiError(AppError.conflict('BLOCK_CONFLICT', 'Conflito', { violations: ['x'] })),
    ).toEqual({
      statusCode: 409,
      code: 'BLOCK_CONFLICT',
      message: 'Conflito',
      details: { violations: ['x'] },
    });
  });

  it('maps zod errors to a 400 with issue paths', () => {
    const result = z.object({ title: z.string() }).safeParse({ title: 1 });
    const body = toApiError(result.error);
    expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(body.details).toEqual([expect.objectContaining({ path: 'title' })]);
  });

  it('maps Prisma "record not found" to 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(toApiError(error)).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('maps HTTP exceptions', () => {
    expect(toApiError(new NotFoundException('nope'))).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(toApiError(new BadRequestException('bad'))).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'bad',
    });
    expect(toApiError(new HttpException('slow down', 429))).toMatchObject({ code: 'RATE_LIMITED' });
    expect(toApiError(new HttpException('teapot', 418))).toMatchObject({ code: 'HTTP_ERROR' });
  });

  it('hides unknown errors behind a generic 500', () => {
    expect(toApiError(new Error('db password is hunter2'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    });
  });
});
