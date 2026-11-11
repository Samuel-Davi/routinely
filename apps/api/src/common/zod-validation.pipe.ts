import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Validates and transforms a payload with a shared zod schema (ADR-001). */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    // A ZodError is translated to a 400 by the global exception filter.
    return this.schema.parse(value);
  }
}
