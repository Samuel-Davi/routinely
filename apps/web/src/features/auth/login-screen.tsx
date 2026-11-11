'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@routinely/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Banner, Button, Input } from '@/components/ui';
import { errorMessage, isApiError } from '@/lib/api-client';
import { AuthCard } from './auth-card';
import { safeNext, useAuthConfig, useDemoLogin, useLogin } from './api';

type FormValues = z.input<typeof loginSchema>;

export function LoginScreen() {
  const next = safeNext(useSearchParams().get('next'));
  const config = useAuthConfig();
  const login = useLogin(next);
  const demo = useDemoLogin(next);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues, unknown, LoginInput>({ resolver: zodResolver(loginSchema) });

  const failure = login.error ?? demo.error;
  const busy = login.isPending || demo.isPending;

  return (
    <AuthCard
      title="Entrar"
      description="Sua rotina semanal, montada com IA."
      footer={
        config.data?.registrationEnabled ? (
          <>
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="font-medium text-accent-text">
              Criar conta
            </Link>
          </>
        ) : undefined
      }
    >
      <form
        onSubmit={handleSubmit((values) => login.mutate(values))}
        noValidate
        className="flex flex-col gap-4"
      >
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
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {failure ? (
          <p role="alert" className="text-footnote text-danger">
            {isApiError(failure, 'RATE_LIMITED') || isApiError(failure, 'UNAUTHENTICATED')
              ? failure.message
              : errorMessage(failure, 'Não foi possível entrar. Tente novamente.')}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={login.isPending} disabled={busy}>
          Entrar
        </Button>
      </form>

      {config.data?.demoAvailable ? (
        <div className="mt-5 flex flex-col gap-3 border-t border-separator pt-5">
          <Button
            icon="calendar"
            loading={demo.isPending}
            disabled={busy}
            onClick={() => demo.mutate()}
          >
            Entrar como demo
          </Button>
          <Banner tone="info" title="Modo demo, sem IA">
            Conta de demonstração com dados fictícios. A IA fica desligada e os dados são
            compartilhados e restaurados periodicamente.
          </Banner>
        </div>
      ) : null}
    </AuthCard>
  );
}
