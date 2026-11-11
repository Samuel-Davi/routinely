'use client';

import {
  dateStringSchema,
  timeStringSchema,
  timeToMinutes,
  toLocalDateTime,
  type RoutineBlock,
} from '@routinely/shared';
import { useState } from 'react';
import { Badge, Button, Input, Sheet } from '@/components/ui';
import { useCommitments } from '@/features/commitments/api';
import { instantAt, isBlockDone } from '@/features/calendar/layout';
import {
  PRIORITY_LABEL,
  PRIORITY_TONE,
  VIOLATION_LABEL,
  formatDateTime,
  formatDuration,
  formatTime,
} from '@/lib/labels';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelClosed, selectPanel } from '@/lib/store/ui-slice';
import { useCompleteBlock, useLockBlock, useMoveBlock } from './api';
import { useRoutineDnd } from './routine-dnd';

interface BlockDetailsSheetProps {
  blocks: readonly RoutineBlock[];
}

/** Details of one block, with complete/lock and a keyboard-friendly way to move it. */
export function BlockDetailsSheet({ blocks }: BlockDetailsSheetProps) {
  const dispatch = useAppDispatch();
  const panel = useAppSelector(selectPanel);
  const open = panel?.type === 'block-details';
  const block = open ? blocks.find((item) => item.id === panel.blockId) : undefined;
  const close = () => dispatch(panelClosed());

  return (
    <Sheet open={open && block !== undefined} onClose={close} title={block?.task.title ?? 'Bloco'}>
      {/* Keyed by time too: if the block moves (drag, replan) the form starts over. */}
      {block ? (
        <BlockDetails
          key={`${block.id}:${block.start}:${block.end}`}
          block={block}
          onClose={close}
        />
      ) : null}
    </Sheet>
  );
}

function BlockDetails({ block, onClose }: { block: RoutineBlock; onClose: () => void }) {
  const dnd = useRoutineDnd();
  const timezone = dnd.prefs.timezone;
  const complete = useCompleteBlock();
  const lock = useLockBlock();
  const move = useMoveBlock();
  const done = isBlockDone(block);
  const { data: commitments } = useCommitments();
  const commitmentTitle = commitments?.find((item) => item.id === block.task.commitmentId)?.title;

  const localStart = toLocalDateTime(Date.parse(block.start), timezone);
  const localEnd = toLocalDateTime(Date.parse(block.end), timezone);
  const [date, setDate] = useState(localStart.slice(0, 10));
  const [startTime, setStartTime] = useState(localStart.slice(11));
  const [endTime, setEndTime] = useState(localEnd.slice(11));

  const wellFormed =
    dateStringSchema.safeParse(date).success &&
    timeStringSchema.safeParse(startTime).success &&
    timeStringSchema.safeParse(endTime).success;
  const start = wellFormed ? instantAt(date, timeToMinutes(startTime), timezone) : Number.NaN;
  const end = wellFormed ? instantAt(date, timeToMinutes(endTime), timezone) : Number.NaN;
  const changed = start !== Date.parse(block.start) || end !== Date.parse(block.end);
  // Same rules as dragging, checked as the user types.
  const violations = wellFormed && changed ? dnd.check(block, start, end) : [];
  const minutes = (Date.parse(block.end) - Date.parse(block.start)) / 60_000;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-headline tabular-nums">
          {formatDateTime(block.start, timezone)} – {formatTime(block.end, timezone)}
          <span className="text-label-secondary"> · {formatDuration(minutes)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_TONE[block.task.priority]}>
            Prioridade {PRIORITY_LABEL[block.task.priority].toLowerCase()}
          </Badge>
          {commitmentTitle ? (
            <Badge tone="gray" icon="calendar">
              {commitmentTitle}
            </Badge>
          ) : null}
          {done ? (
            <Badge tone="green" icon="check">
              Concluído
            </Badge>
          ) : null}
          {block.locked ? (
            <Badge tone="gray" icon="lock">
              Travado
            </Badge>
          ) : null}
        </div>
        <p className="text-footnote text-label-secondary">
          Prazo da tarefa: {formatDateTime(block.task.deadline, timezone)}
        </p>
        {block.rationale ? (
          <p className="rounded-control bg-fill px-3 py-2 text-footnote text-label-secondary">
            <span className="font-medium text-label">Por que este horário: </span>
            {block.rationale}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={done ? 'secondary' : 'primary'}
          icon="check"
          loading={complete.isPending}
          disabled={block.task.status === 'DONE' && block.completedAt === null}
          onClick={() =>
            complete.mutate(
              { blockId: block.id, completed: block.completedAt === null },
              { onSuccess: onClose },
            )
          }
        >
          {block.completedAt === null ? 'Concluir bloco' : 'Reabrir bloco'}
        </Button>
        {done ? null : (
          <Button
            icon={block.locked ? 'unlock' : 'lock'}
            loading={lock.isPending}
            onClick={() => lock.mutate({ blockId: block.id, locked: !block.locked })}
          >
            {block.locked ? 'Destravar' : 'Travar'}
          </Button>
        )}
      </div>

      {done ? null : (
        <form
          className="flex flex-col gap-3 border-t border-separator pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!wellFormed || !changed || violations.length > 0) return;
            move.mutate({ blockId: block.id, start, end }, { onSuccess: onClose });
          }}
        >
          <div>
            <h3 className="text-body font-semibold">Mudar horário</h3>
            <p className="text-footnote text-label-secondary">
              Blocos movidos por você ficam travados e são mantidos ao replanejar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input
              label="Dia"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              containerClassName="col-span-2 sm:col-span-1"
            />
            <Input
              label="Início"
              type="time"
              step={900}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
            <Input
              label="Fim"
              type="time"
              step={900}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
          {violations.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-0.5 text-footnote text-danger">
              {violations.map((violation) => (
                <li key={violation}>{VIOLATION_LABEL[violation]}</li>
              ))}
            </ul>
          ) : null}
          <Button
            type="submit"
            className="self-end"
            loading={move.isPending}
            disabled={!wellFormed || !changed || violations.length > 0}
          >
            Salvar horário
          </Button>
        </form>
      )}
    </div>
  );
}
