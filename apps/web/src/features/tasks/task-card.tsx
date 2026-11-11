'use client';

import type { Task } from '@routinely/shared';
import { Badge, Button, Icon, IconButton, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  ESTIMATION_SOURCE_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  STATUS_LABEL,
  formatDateTime,
  formatDuration,
  formatRelativeDeadline,
} from '@/lib/labels';

interface TaskCardProps {
  task: Task;
  timezone: string;
  /** Title of the linked commitment, when the task has one. */
  commitmentTitle?: string;
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onReestimate: (task: Task) => void;
}

/** Five dots: how hard the AI (or the user) thinks the task is. */
function Complexity({ value }: { value: number }) {
  return (
    <span
      role="img"
      aria-label={`Complexidade ${value} de 5`}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          className={cn(
            'size-1.5 rounded-full',
            level <= value ? 'bg-label-secondary' : 'bg-fill-strong',
          )}
        />
      ))}
    </span>
  );
}

function Estimate({ task, onReestimate }: { task: Task; onReestimate: () => void }) {
  if (task.estimationStatus === 'PENDING') {
    return (
      <p role="status" className="flex items-center gap-2 text-footnote text-label-secondary">
        <Spinner size={12} />
        Estimando com IA…
      </p>
    );
  }
  if (
    task.estimationStatus === 'FAILED' ||
    task.estimatedMinutes === null ||
    task.complexity === null
  ) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-footnote text-danger">
          <Icon name="alert" size={14} />
          Não foi possível estimar
        </p>
        <Button size="sm" variant="ghost" icon="refresh" onClick={onReestimate}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-label-secondary">
        <span className="flex items-center gap-1 font-medium text-label tabular-nums">
          <Icon name="clock" size={14} />
          {formatDuration(task.estimatedMinutes)}
        </span>
        <Complexity value={task.complexity} />
        <span>{task.splittable ? 'Divisível' : 'Bloco único'}</span>
        {task.estimationSource ? (
          <Badge
            tone={
              task.estimationSource === 'AI'
                ? 'purple'
                : task.estimationSource === 'MANUAL'
                  ? 'gray'
                  : 'orange'
            }
            icon={task.estimationSource === 'AI' ? 'sparkles' : undefined}
          >
            {ESTIMATION_SOURCE_LABEL[task.estimationSource]}
          </Badge>
        ) : null}
      </div>
      {task.aiRationale ? (
        <p className="text-footnote text-label-secondary">{task.aiRationale}</p>
      ) : null}
    </div>
  );
}

export function TaskCard({
  task,
  timezone,
  commitmentTitle,
  onToggleDone,
  onEdit,
  onDelete,
  onReestimate,
}: TaskCardProps) {
  const done = task.status === 'DONE';
  const deadline = formatRelativeDeadline(task.deadline);

  return (
    <article
      className={cn('flex gap-3 rounded-card bg-surface p-4 shadow-card', done && 'opacity-70')}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        onClick={() => onToggleDone(task)}
        className={cn(
          'pressable mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
          done
            ? 'border-success bg-success text-surface'
            : 'border-label-tertiary text-transparent hover:border-success',
        )}
      >
        <Icon name="check" size={14} strokeWidth={3} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className={cn('text-headline font-semibold break-words', done && 'line-through')}>
              {task.title}
            </h3>
            {task.description ? (
              <p className="mt-0.5 line-clamp-2 text-body text-label-secondary">
                {task.description}
              </p>
            ) : null}
          </div>
          <div className="-mt-1.5 -mr-2 flex shrink-0">
            <IconButton icon="edit" label={`Editar ${task.title}`} onClick={() => onEdit(task)} />
            <IconButton
              icon="trash"
              label={`Excluir ${task.title}`}
              onClick={() => onDelete(task)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
          {commitmentTitle ? (
            <Badge tone="gray" icon="calendar">
              {commitmentTitle}
            </Badge>
          ) : null}
          <Badge tone={done ? 'green' : task.status === 'SCHEDULED' ? 'blue' : 'gray'}>
            {STATUS_LABEL[task.status]}
          </Badge>
          <span
            className={cn(
              'text-footnote',
              deadline.overdue && !done ? 'font-medium text-danger' : 'text-label-secondary',
            )}
          >
            <time dateTime={task.deadline}>{formatDateTime(task.deadline, timezone)}</time>
            {done ? null : ` · ${deadline.text}`}
          </span>
        </div>

        {done ? null : <Estimate task={task} onReestimate={() => onReestimate(task)} />}
      </div>
    </article>
  );
}
