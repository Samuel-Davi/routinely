'use client';

import { PRIORITIES } from '@routinely/shared';
import { Button, Sheet, toneStyle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PRIORITY_LABEL, PRIORITY_TONE } from '@/lib/labels';
import {
  filtersCleared,
  priorityFilterToggled,
  selectActiveFilterCount,
  selectCalendarFilters,
  showCompletedToggled,
} from '@/lib/store/calendar-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelClosed, selectPanel } from '@/lib/store/ui-slice';

/** Which task blocks the calendar shows. Fixed commitments are always visible. */
export function CalendarFiltersSheet() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectPanel)?.type === 'calendar-filters';
  const filters = useAppSelector(selectCalendarFilters);
  const activeCount = useAppSelector(selectActiveFilterCount);
  const close = () => dispatch(panelClosed());

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Filtros"
      description="Escolha quais blocos de tarefa aparecem no calendário."
      footer={
        <>
          <Button
            variant="ghost"
            disabled={activeCount === 0}
            onClick={() => dispatch(filtersCleared())}
          >
            Limpar
          </Button>
          <Button variant="primary" onClick={close} data-autofocus>
            Concluir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-footnote font-medium text-label-secondary">
            Prioridade
          </legend>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((priority) => {
              const selected = filters.priorities.includes(priority);
              return (
                <button
                  key={priority}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => dispatch(priorityFilterToggled(priority))}
                  style={toneStyle(PRIORITY_TONE[priority])}
                  className={cn(
                    'pressable h-11 rounded-full px-4 text-footnote font-medium',
                    selected ? 'tone-solid text-surface' : 'tone-surface',
                  )}
                >
                  {PRIORITY_LABEL[priority]}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-footnote text-label-tertiary">
            Nenhuma selecionada mostra todas.
          </p>
        </fieldset>

        <label className="flex items-center justify-between gap-4 text-body">
          Mostrar blocos concluídos
          <input
            type="checkbox"
            role="switch"
            className="size-5 accent-(--accent)"
            checked={filters.showCompleted}
            onChange={() => dispatch(showCompletedToggled())}
          />
        </label>
      </div>
    </Sheet>
  );
}
