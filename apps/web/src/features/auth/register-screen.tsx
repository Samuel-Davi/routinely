'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, registerSchema, type RegisterInput } from '@routinely/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button, Input, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api-client';
import { AiPrivacyNotice } from './ai-privacy-notice';
import { AuthCard } from './auth-card';
import { useAuthConfig, useRegister } from './api';

type FormValues = z.input<typeof registerSchema>;

export function RegisterScreen() {
  const router = useRouter();
  const config = useAuthConfig();
  const registerUser = useRegister('/');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues, unknown, RegisterInput>({ resolver: zodResolver(registerSchema) });

  // Closed signup: the screen simply is not there (the API refuses it as well).
  const closed = config.data?.registrationEnabled === false;
  useEffect(() => {
    if (closed) router.replace('/login');
  }, [closed, router]);

  if (!config.data || closed) {
    return <Skeleton className="h-96 w-full max-w-sm rounded-card" />;
  }

  return (
    <AuthCard
      title="Criar conta"
      description="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-accent-text">
            Entrar
          </Link>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((values) => registerUser.mutate(values))}
        noValidate
        className="flex flex-col gap-4"
      >
        <Input
          label="Nome (opcional)"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Senha"
          type="password"
          autoComplete="new-password"
          hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres, com letras e números.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <AiPrivacyNotice />
        {registerUser.error ? (
          <p role="alert" className="text-footnote text-danger">
            {errorMessage(registerUser.error, 'Não foi possível criar a conta.')}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={registerUser.isPending}>
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}
