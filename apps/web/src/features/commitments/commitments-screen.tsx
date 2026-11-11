'use client';

import type { FixedCommitment } from '@routinely/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/shell/app-shell';
import {
  Badge,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingRegion,
  Skeleton,
  toneStyle,
  useToast,
} from '@/components/ui';
import { errorMessage } from '@/lib/api-client';
import { CATEGORY_LABEL, formatWeekdays } from '@/lib/labels';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelClosed, panelOpened, selectPanel } from '@/lib/store/ui-slice';
import { useCommitments, useDeleteCommitment } from './api';
import { CommitmentFormSheet } from './commitment-form';

export function CommitmentsScreen() {
  const dispatch = useAppDispatch();
  const panel = useAppSelector(selectPanel);
  const { data, isPending, isError, error, refetch } = useCommitments();
  const remove = useDeleteCommitment();
  const toast = useToast();
  const [deleting, setDeleting] = useState<FixedCommitment | null>(null);

  const formOpen = panel?.type === 'commitment-form';
  const editing = formOpen ? data?.find((item) => item.id === panel.commitmentId) : undefined;
  const openForm = (commitmentId?: string) =>
    dispatch(panelOpened({ type: 'commitment-form', commitmentId }));

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => toast.success('Compromisso excluído'),
      onError: (mutationError) =>
        toast.error(errorMessage(mutationError, 'Não foi possível excluir.')),
    });
    setDeleting(null);
  };

  return (
    <>
      <PageHeader
        title="Compromissos"
        description="O que se repete toda semana. A rotina é montada em volta deles."
        actions={
          <Button variant="primary" icon="plus" onClick={() => openForm()}>
            Novo compromisso
          </Button>
        }
      />

      {isPending ? (
        <LoadingRegion label="Carregando compromissos">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24 rounded-card" />
            ))}
          </div>
        </LoadingRegion>
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="Nenhum compromisso fixo"
          description="Cadastre trabalho, aulas e treinos para que a rotina nunca agende tarefas nesses horários."
          action={
            <Button variant="primary" icon="plus" onClick={() => openForm()}>
              Novo compromisso
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((commitment) => (
            <li
              key={commitment.id}
              style={toneStyle(commitment.color)}
              className="relative flex items-start gap-3 overflow-hidden rounded-card bg-surface p-4 pl-5 shadow-card"
            >
              <span aria-hidden="true" className="tone-solid absolute inset-y-0 left-0 w-1.5" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-headline font-semibold">{commitment.title}</h2>
                <p className="mt-0.5 text-body text-label-secondary tabular-nums">
                  {commitment.startTime}–{commitment.endTime}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={commitment.color}>{CATEGORY_LABEL[commitment.category]}</Badge>
                  <span className="text-footnote text-label-secondary">
                    {formatWeekdays(commitment.daysOfWeek)}
                  </span>
                </div>
              </div>
              <div className="-mt-1 -mr-2 flex">
                <IconButton
                  icon="edit"
                  label={`Editar ${commitment.title}`}
                  onClick={() => openForm(commitment.id)}
                />
                <IconButton
                  icon="trash"
                  label={`Excluir ${commitment.title}`}
                  onClick={() => setDeleting(commitment)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CommitmentFormSheet
        open={formOpen}
        onClose={() => dispatch(panelClosed())}
        commitment={editing}
      />
      <ConfirmSheet
        open={deleting !== null}
        title="Excluir compromisso?"
        description={`"${deleting?.title ?? ''}" deixará de bloquear horários na sua rotina. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
