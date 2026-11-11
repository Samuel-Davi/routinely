'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PRIORITIES,
  createTaskSchema,
  fromLocalDateTime,
  localDateTimeSchema,
  prioritySchema,
  taskEstimateOverrideSchema,
  toLocalDateTime,
  type Task,
} from '@routinely/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Input, Select, Sheet, Textarea, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/api-client';
import { PRIORITY_LABEL } from '@/lib/labels';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { selectTaskDraft, taskDraftSaved } from '@/lib/store/ui-slice';
import { useCreateTask, useReestimateTask, useUpdateTask } from './api';

/** Form values: the deadline is edited as local wall-clock time. */
const formSchema = z.object({
  title: createTaskSchema.shape.title,
  description: z.string().trim().max(2000, 'Máximo de 2000 caracteres'),
  priority: prioritySchema,
  deadline: localDateTimeSchema,
  // Only shown (and sent) when editing an estimated task.
  estimate: taskEstimateOverrideSchema.optional(),
});
type FormValues = z.infer<typeof formSchema>;

/** Tomorrow at 18:00 local: a sensible default deadline. */
function defaultDeadline(timezone: string): string {
  return `${toLocalDateTime(Date.now() + 86_400_000, timezone).slice(0, 10)}T18:00`;
}

interface TaskFormSheetProps {
  open: boolean;
  onClose: () => void;
  timezone: string;
  /** Present when editing. */
  task?: Task;
}

export function TaskFormSheet({ open, onClose, timezone, task }: TaskFormSheetProps) {
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectTaskDraft);
  const toast = useToast();
  const create = useCreateTask();
  const update = useUpdateTask();
  const reestimate = useReestimateTask();
  const editing = Boolean(task);
  const hasEstimate =
    task?.estimationStatus === 'DONE' && task.estimatedMinutes !== null && task.complexity !== null;

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (!open) return;
    if (task) {
      reset({
        title: task.title,
        description: task.description,
        priority: task.priority,
        deadline: toLocalDateTime(Date.parse(task.deadline), timezone),
        estimate:
          task.estimatedMinutes !== null && task.complexity !== null
            ? {
                complexity: task.complexity,
                estimatedMinutes: task.estimatedMinutes,
                splittable: task.splittable ?? true,
              }
            : undefined,
      });
    } else {
      reset({
        title: draft?.title ?? '',
        description: draft?.description ?? '',
        priority: draft?.priority ?? 'MEDIUM',
        deadline: draft?.deadline
          ? toLocalDateTime(Date.parse(draft.deadline), timezone)
          : defaultDeadline(timezone),
      });
    }
    // `draft` is read once on open on purpose: typing must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, timezone, reset]);

  const toIso = (local: string) => new Date(fromLocalDateTime(local, timezone)).toISOString();

  const close = () => {
    if (!editing && isDirty) {
      const values = getValues();
      const deadline = localDateTimeSchema.safeParse(values.deadline);
      dispatch(
        taskDraftSaved({
          title: values.title,
          description: values.description,
          priority: values.priority,
          ...(deadline.success ? { deadline: toIso(deadline.data) } : {}),
        }),
      );
    }
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    const base = {
      title: values.title,
      description: values.description,
      priority: values.priority,
      deadline: toIso(values.deadline),
    };
    try {
      if (task) {
        // Send the estimate only when the user actually changed it (manual override).
        const overridden = Boolean(dirtyFields.estimate) && values.estimate;
        await update.mutateAsync({
          id: task.id,
          input: { ...base, ...(overridden ? { estimate: values.estimate } : {}) },
        });
        toast.success('Tarefa atualizada');
      } else {
        await create.mutateAsync(base);
        dispatch(taskDraftSaved(null));
        toast.success('Tarefa criada. A IA está estimando a duração.');
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Não foi possível salvar a tarefa.'));
    }
  });

  const askAi = () => {
    if (!task) return;
    reestimate.mutate(task.id, {
      onSuccess: () => {
        toast.info('Nova estimativa solicitada à IA');
        onClose();
      },
      onError: (error) => toast.error(errorMessage(error, 'Não foi possível pedir a estimativa.')),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={editing ? 'Editar tarefa' : 'Nova tarefa'}
      description={
        editing ? undefined : 'A IA estima a complexidade e a duração assim que você salvar.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="task-form"
            loading={create.isPending || update.isPending}
          >
            Salvar
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Título"
          placeholder="Ex.: Preparar apresentação"
          autoComplete="off"
          data-autofocus
          error={errors.title?.message}
          {...register('title')}
        />
        <Textarea
          label="Descrição"
          placeholder="Detalhes ajudam a IA a estimar melhor (opcional)"
          rows={3}
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Prioridade" error={errors.priority?.message} {...register('priority')}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </Select>
          <Input
            label="Prazo"
            type="datetime-local"
            error={errors.deadline?.message}
            {...register('deadline')}
          />
        </div>

        {hasEstimate ? (
          <fieldset className="flex flex-col gap-3 rounded-card bg-fill p-4">
            <legend className="sr-only">Estimativa</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-body font-semibold">Estimativa</p>
                <p className="text-footnote text-label-secondary">
                  Ajuste se a IA errou. Seu valor nunca é sobrescrito.
                </p>
              </div>
              <Button size="sm" icon="sparkles" onClick={askAi} loading={reestimate.isPending}>
                Pedir à IA de novo
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Complexidade"
                className="bg-surface"
                error={errors.estimate?.complexity?.message}
                {...register('estimate.complexity', { valueAsNumber: true })}
              >
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    {level} de 5
                  </option>
                ))}
              </Select>
              <Input
                label="Duração (minutos)"
                type="number"
                inputMode="numeric"
                min={15}
                step={15}
                className="bg-surface"
                hint="Múltiplos de 15"
                error={errors.estimate?.estimatedMinutes?.message}
                {...register('estimate.estimatedMinutes', { valueAsNumber: true })}
              />
            </div>
            <label className="flex items-center gap-2.5 text-body">
              <input
                type="checkbox"
                className="size-4.5 accent-(--accent)"
                {...register('estimate.splittable')}
              />
              Pode ser dividida em mais de um bloco
            </label>
          </fieldset>
        ) : null}
      </form>
    </Sheet>
  );
}
