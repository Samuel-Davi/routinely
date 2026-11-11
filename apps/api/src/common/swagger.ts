import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiParam, ApiResponse, type ApiBodyOptions } from '@nestjs/swagger';
import { z } from 'zod';

type SchemaObject = Extract<ApiBodyOptions, { schema: unknown }>['schema'];

/** zod schema → OpenAPI 3 schema object. */
export function toOpenApi(schema: z.ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return jsonSchema as SchemaObject;
}

export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: toOpenApi(schema, 'input') });

export const ApiZodResponse = (schema: z.ZodType, status = 200, description?: string) =>
  ApiResponse({ status, description, schema: toOpenApi(schema) });

export const ApiIdParam = (name = 'id') =>
  applyDecorators(ApiParam({ name, schema: { type: 'string', format: 'uuid' } }));
