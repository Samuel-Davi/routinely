import { idSchema } from '@routinely/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

/** Validates a UUID route param. */
export const IdPipe = new ZodValidationPipe(idSchema);
