import { z } from 'zod';
import { idSchema } from './common';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Passwords that pass the length and variety rules but are trivially guessable. */
const COMMON_PASSWORDS = new Set([
  'password123',
  'password1234',
  '1234567890',
  '12345678910',
  'qwerty12345',
  'qwertyuiop1',
  'abc1234567',
  'senha12345',
  'senha123456',
  'mudar12345',
  'iloveyou123',
]);

/**
 * Minimum strength (no composition theatre): at least 10 characters, a letter and a digit,
 * not a well-known password and not one repeated character.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres`)
  .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), 'Misture letras e números')
  .refine((value) => new Set(value).size > 3, 'Evite repetir o mesmo caractere')
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), 'Essa senha é muito comum');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-mail longo demais')
  .pipe(z.email('Informe um e-mail válido'));

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(80, 'Máximo de 80 caracteres').optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** Login does not re-check strength: old passwords must still work. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: idSchema,
  email: z.string().nullable(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;
