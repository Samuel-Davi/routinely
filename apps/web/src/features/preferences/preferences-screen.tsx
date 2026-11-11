'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { preferencesSchema, type Preferences } from '@routinely/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader } from '@/components/shell/app-shell';
import {
  Button,
  ErrorState,
  Input,
  LoadingRegion,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import { errorMessage } from '@/lib/api-client';
import { formatDuration } from '@/lib/labels';
import { usePreferences, useUpdatePreferences } from './api';

const TIMEZONES = [
  ['America/Manaus', 'Manaus (UTC−4)'],
  ['America/Sao_Paulo', 'Brasília / São Paulo (UTC−3)'],
  ['America/Belem', 'Belém (UTC−3)'],
  ['America/Fortaleza', 'Fortaleza (UTC−3)'],
  ['America/Recife', 'Recife (UTC−3)'],
  ['America/Cuiaba', 'Cuiabá (UTC−4)'],
  ['America/Porto_Velho', 'Porto Velho (UTC−4)'],
  ['America/Boa_Vista', 'Boa Vista (UTC−4)'],
  ['America/Rio_Branco', 'Rio Branco (UTC−5)'],
  ['America/Noronha', 'Fernando de Noronha (UTC−2)'],
  ['Europe/Lisbon', 'Lisboa'],
  ['UTC', 'UTC'],
] as const;

const BLOCK_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240];
const BREAK_OPTIONS = [0, 15, 30, 45, 60];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-surface p-5 shadow-card">
      <h2 className="text-headline font-semibold">{title}</h2>
      <p className="mt-0.5 mb-4 text-footnote text-label-secondary">{description}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function PreferencesScreen() {
  const { data, isPending, isError, error, refetch } = usePreferences();
  const update = useUpdatePreferences();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Preferences>({ resolver: zodResolver(preferencesSchema) });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const onSubmit = handleSubmit(async (input) => {
    try {
      reset(await update.mutateAsync(input));
      toast.success('Preferências salvas');
    } catch (mutationError) {
      toast.error(errorMessage(mutationError, 'Não foi possível salvar as preferências.'));
    }
  });

  return (
    <>
      <PageHeader title="Ajustes" description="Como a sua rotina deve ser montada." />
      {isPending ? (
        <LoadingRegion label="Carregando preferências">
          <div className="flex max-w-2xl flex-col gap-4">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-40 rounded-card" />
            ))}
          </div>
        </LoadingRegion>
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-4">
          <Section
            title="Janela diária"
            description="Nenhuma tarefa é agendada fora deste período."
          >
            <Input
              label="Início do dia"
              type="time"
              step={900}
              error={errors.dayStart?.message}
              {...register('dayStart')}
            />
            <Input
              label="Fim do dia"
              type="time"
              step={900}
              error={errors.dayEnd?.message}
              {...register('dayEnd')}
            />
          </Section>

          <Section title="Almoço / descanso" description="Horário protegido, todos os dias.">
            <Input
              label="Início"
              type="time"
              step={900}
              error={errors.lunchStart?.message}
              {...register('lunchStart')}
            />
            <Input
              label="Fim"
              type="time"
              step={900}
              error={errors.lunchEnd?.message}
              {...register('lunchEnd')}
            />
          </Section>

          <Section
            title="Blocos de foco"
            description="Limites para cada sessão de trabalho em uma tarefa."
          >
            <Select
              label="Duração máxima de um bloco"
              error={errors.maxFocusBlockMinutes?.message}
              {...register('maxFocusBlockMinutes', { valueAsNumber: true })}
            >
              {BLOCK_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatDuration(minutes)}
                </option>
              ))}
            </Select>
            <Select
              label="Intervalo mínimo entre blocos"
              error={errors.minBreakMinutes?.message}
              {...register('minBreakMinutes', { valueAsNumber: true })}
            >
              {BREAK_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'Sem intervalo' : formatDuration(minutes)}
                </option>
              ))}
            </Select>
          </Section>

          <Section
            title="Fuso horário"
            description="Usado para exibir e planejar todos os horários."
          >
            <Select
              label="Fuso"
              error={errors.timezone?.message}
              containerClassName="sm:col-span-2"
              {...register('timezone')}
            >
              {!TIMEZONES.some(([zone]) => zone === data.timezone) ? (
                <option value={data.timezone}>{data.timezone}</option>
              ) : null}
              {TIMEZONES.map(([zone, label]) => (
                <option key={zone} value={zone}>
                  {label}
                </option>
              ))}
            </Select>
          </Section>

          <div className="flex items-center justify-end gap-3">
            {isDirty ? (
              <span className="text-footnote text-label-secondary">Alterações não salvas</span>
            ) : null}
            <Button
              variant="primary"
              type="submit"
              size="lg"
              loading={update.isPending}
              disabled={!isDirty}
            >
              Salvar preferências
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
