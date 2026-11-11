'use client';

import type { Task } from '@routinely/shared';
import { useId, useState } from 'react';
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

/** Estimate status that must stay visible (progress or failure); the rest is disclosed on demand. */
function EstimateStatus({ task, onReestimate }: { task: Task; onReestimate: () => void }) {
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
  return null;
}

/** Everything that is not needed to scan the list: effort, source and the AI's reasoning. */
function Details({ task }: { task: Task }) {
  // A finished task no longer needs its effort shown.
  const estimated =
    task.status !== 'DONE' &&
    task.estimationStatus === 'DONE' &&
    task.estimatedMinutes !== null &&
    task.complexity !== null;
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      {task.description ? (
        <p className="text-body text-label-secondary">{task.description}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-label-secondary">
        <Badge
          tone={task.status === 'DONE' ? 'green' : task.status === 'SCHEDULED' ? 'blue' : 'gray'}
        >
          {STATUS_LABEL[task.status]}
        </Badge>
        {estimated ? (
          <>
            <span className="flex items-center gap-1 font-medium text-label tabular-nums">
              <Icon name="clock" size={14} />
              {formatDuration(task.estimatedMinutes as number)}
            </span>
            <Complexity value={task.complexity as number} />
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
          </>
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
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <article
      className={cn(
        'flex gap-3 rounded-card bg-surface p-4 shadow-[0_0_0_1px_var(--hairline)]',
        done && 'opacity-70',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        onClick={() => onToggleDone(task)}
        // 44px touch target around a 24px visual circle
        className="pressable -m-2.5 flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-6 items-center justify-center rounded-full border-2',
            done
              ? 'border-success bg-success text-surface'
              : 'border-label-tertiary text-transparent',
          )}
        >
          <Icon name="check" size={14} strokeWidth={3} />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className={cn('text-headline font-semibold break-words', done && 'line-through')}>
              {task.title}
            </h3>
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

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
          {commitmentTitle ? (
            <Badge tone="gray" icon="calendar">
              {commitmentTitle}
            </Badge>
          ) : null}
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

        {done ? null : <EstimateStatus task={task} onReestimate={() => onReestimate(task)} />}

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          className="pressable -mb-2 flex h-11 w-fit items-center gap-1 self-start rounded-control pr-3 text-footnote font-medium text-accent-text"
        >
          Detalhes
          <Icon name="chevron-down" size={14} className={cn(expanded && 'rotate-180')} />
        </button>
        {expanded ? (
          <div id={detailsId}>
            <Details task={task} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
