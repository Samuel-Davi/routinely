'use client';

import type { Task } from '@routinely/shared';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shell/app-shell';
import {
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  LoadingRegion,
  SegmentedControl,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useTimezone } from '@/features/preferences/api';
import { errorMessage } from '@/lib/api-client';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelClosed, panelOpened, selectPanel } from '@/lib/store/ui-slice';
import { useDeleteTask, useReestimateTask, useTasks, useUpdateTask } from './api';
import { TaskCard } from './task-card';
import { TaskFormSheet } from './task-form';

type Tab = 'open' | 'done';

export function TasksScreen() {
  const dispatch = useAppDispatch();
  const panel = useAppSelector(selectPanel);
  const timezone = useTimezone();
  const { data, isPending, isError, error, refetch } = useTasks();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const reestimate = useReestimateTask();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('open');
  const [deleting, setDeleting] = useState<Task | null>(null);

  const formOpen = panel?.type === 'task-form';
  const editing = formOpen ? data?.find((task) => task.id === panel.taskId) : undefined;
  const openForm = (taskId?: string) => dispatch(panelOpened({ type: 'task-form', taskId }));

  const { open, done } = useMemo(
    () => ({
      open: data?.filter((task) => task.status !== 'DONE') ?? [],
      done: data?.filter((task) => task.status === 'DONE') ?? [],
    }),
    [data],
  );
  const visible = tab === 'open' ? open : done;

  const toggleDone = (task: Task) =>
    update.mutate(
      { id: task.id, input: { status: task.status === 'DONE' ? 'TODO' : 'DONE' } },
      {
        onError: (mutationError) =>
          toast.error(errorMessage(mutationError, 'Não foi possível atualizar a tarefa.')),
      },
    );

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => toast.success('Tarefa excluída'),
      onError: (mutationError) =>
        toast.error(errorMessage(mutationError, 'Não foi possível excluir.')),
    });
    setDeleting(null);
  };

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="O que precisa ser feito, com prioridade e prazo. A IA estima o esforço."
        actions={
          <Button variant="primary" icon="plus" onClick={() => openForm()}>
            Nova tarefa
          </Button>
        }
      />

      {isPending ? (
        <LoadingRegion label="Carregando tarefas">
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-32 rounded-card" />
            ))}
          </div>
        </LoadingRegion>
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon="checklist"
          title="Nenhuma tarefa ainda"
          description="Crie uma tarefa com prazo e prioridade. A IA estima a duração e a rotina encontra o melhor horário."
          action={
            <Button variant="primary" icon="plus" onClick={() => openForm()}>
              Nova tarefa
            </Button>
          }
        />
      ) : (
        <>
          <SegmentedControl
            label="Filtrar tarefas"
            value={tab}
            onChange={setTab}
            className="mb-4"
            options={[
              { value: 'open', label: `Abertas (${open.length})` },
              { value: 'done', label: `Concluídas (${done.length})` },
            ]}
          />
          {visible.length === 0 ? (
            <EmptyState
              icon={tab === 'open' ? 'check' : 'checklist'}
              title={tab === 'open' ? 'Tudo concluído' : 'Nada concluído ainda'}
              description={
                tab === 'open'
                  ? 'Você não tem tarefas abertas.'
                  : 'As tarefas concluídas aparecem aqui.'
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((task) => (
                <li key={task.id}>
                  <TaskCard
                    task={task}
                    timezone={timezone}
                    onToggleDone={toggleDone}
                    onEdit={(item) => openForm(item.id)}
                    onDelete={setDeleting}
                    onReestimate={(item) => reestimate.mutate(item.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <TaskFormSheet
        open={formOpen}
        onClose={() => dispatch(panelClosed())}
        timezone={timezone}
        task={editing}
      />
      <ConfirmSheet
        open={deleting !== null}
        title="Excluir tarefa?"
        description={`"${deleting?.title ?? ''}" e seus blocos na rotina serão removidos. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
