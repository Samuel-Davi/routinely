'use client';

import type { RoutineSummary } from '@routinely/shared';
import { PageHeader } from '@/components/shell/app-shell';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingRegion,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useTimezone } from '@/features/preferences/api';
import { errorMessage } from '@/lib/api-client';
import {
  ROUTINE_SOURCE_LABEL,
  ROUTINE_TRIGGER_LABEL,
  formatDate,
  formatDateTime,
} from '@/lib/labels';
import { useRestoreRoutine, useRoutineHistory } from './api';

/** "+3 novos · 2 movidos · 1 removido", or a neutral message when nothing changed. */
export function describeDiff(diff: RoutineSummary['diffSummary']): string {
  if (!diff) return 'Sem comparação';
  const parts = [
    diff.added > 0 ? `${diff.added} ${diff.added === 1 ? 'novo' : 'novos'}` : null,
    diff.moved > 0 ? `${diff.moved} ${diff.moved === 1 ? 'movido' : 'movidos'}` : null,
    diff.removed > 0 ? `${diff.removed} ${diff.removed === 1 ? 'removido' : 'removidos'}` : null,
    diff.kept > 0 ? `${diff.kept} ${diff.kept === 1 ? 'mantido' : 'mantidos'}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nenhum bloco';
}

export function HistoryScreen() {
  const timezone = useTimezone();
  const { data, isPending, isError, error, refetch } = useRoutineHistory();
  const restore = useRestoreRoutine();
  const toast = useToast();

  const onRestore = (routine: RoutineSummary) =>
    restore.mutate(routine.id, {
      onSuccess: (restored) =>
        toast.success(restored.notice ?? `Versão ${routine.version} restaurada`),
      onError: (mutationError) =>
        toast.error(errorMessage(mutationError, 'Não foi possível restaurar esta versão.')),
    });

  return (
    <>
      <PageHeader
        title="Histórico"
        description="Cada geração ou replanejamento cria uma versão. Restaurar traz de volta os blocos que ainda são válidos."
      />
      {isPending ? (
        <LoadingRegion label="Carregando histórico">
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24 rounded-card" />
            ))}
          </div>
        </LoadingRegion>
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon="history"
          title="Nenhuma versão ainda"
          description="Gere sua primeira rotina na tela Semana e ela aparecerá aqui."
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {data.map((routine) => (
            <li
              key={routine.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-surface p-4 shadow-card"
            >
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-headline font-semibold">Versão {routine.version}</h2>
                  {routine.active ? <Badge tone="green">Ativa</Badge> : null}
                  {routine.status === 'PENDING' ? <Badge tone="blue">Gerando…</Badge> : null}
                  {routine.status === 'FAILED' ? <Badge tone="red">Falhou</Badge> : null}
                  <Badge tone="gray">{ROUTINE_TRIGGER_LABEL[routine.trigger]}</Badge>
                  {routine.source ? (
                    <Badge
                      tone={routine.source === 'HEURISTIC' ? 'orange' : 'purple'}
                      icon={routine.source === 'HEURISTIC' ? undefined : 'sparkles'}
                    >
                      {ROUTINE_SOURCE_LABEL[routine.source]}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-footnote text-label-secondary">
                  <time dateTime={routine.createdAt}>
                    {formatDateTime(routine.createdAt, timezone)}
                  </time>{' '}
                  · {formatDate(routine.rangeStart)} a {formatDate(routine.rangeEnd)} ·{' '}
                  {routine.blockCount} {routine.blockCount === 1 ? 'bloco' : 'blocos'}
                </p>
                {routine.status === 'READY' ? (
                  <p className="mt-0.5 text-footnote text-label">
                    <span className="text-label-secondary">Mudanças: </span>
                    {describeDiff(routine.diffSummary)}
                  </p>
                ) : null}
                {routine.status === 'FAILED' && routine.notice ? (
                  <p className="mt-0.5 text-footnote text-danger">{routine.notice}</p>
                ) : null}
              </div>
              {routine.status === 'READY' && !routine.active ? (
                <Button
                  icon="restore"
                  aria-label={`Restaurar versão ${routine.version}`}
                  loading={restore.isPending && restore.variables === routine.id}
                  disabled={restore.isPending}
                  onClick={() => onRestore(routine)}
                >
                  Restaurar
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
