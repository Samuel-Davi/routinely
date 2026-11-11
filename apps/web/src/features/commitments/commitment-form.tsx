'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  COMMITMENT_CATEGORIES,
  COMMITMENT_COLORS,
  findCommitmentOverlaps,
  fixedCommitmentInputSchema,
  type FixedCommitment,
  type FixedCommitmentInput,
} from '@routinely/shared';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { Banner, Button, Input, Select, Sheet, toneStyle, useToast } from '@/components/ui';
import { errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import {
  CATEGORY_LABEL,
  COLOR_LABEL,
  WEEKDAY_LONG,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  formatWeekdays,
} from '@/lib/labels';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { commitmentDraftSaved, selectCommitmentDraft } from '@/lib/store/ui-slice';
import { useCommitments, useSaveCommitment } from './api';

const EMPTY: FixedCommitmentInput = {
  title: '',
  daysOfWeek: [],
  startTime: '08:00',
  endTime: '09:00',
  category: 'WORK',
  color: 'blue',
  requiresTravel: false,
};

interface CommitmentFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing. */
  commitment?: FixedCommitment;
}

type FormInput = z.input<typeof fixedCommitmentInputSchema>;

export function CommitmentFormSheet({ open, onClose, commitment }: CommitmentFormSheetProps) {
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectCommitmentDraft);
  const toast = useToast();
  const save = useSaveCommitment();
  const editing = Boolean(commitment);

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, FixedCommitmentInput>({
    resolver: zodResolver(fixedCommitmentInputSchema),
    defaultValues: EMPTY,
  });

  // Live, non-blocking warning: which existing commitments share time with this one.
  const others = useCommitments().data;
  const [days, startTime, endTime] = useWatch({
    control,
    name: ['daysOfWeek', 'startTime', 'endTime'],
  });
  const overlapping =
    open && others && startTime && endTime && startTime < endTime
      ? findCommitmentOverlaps([
          { id: '__draft__', daysOfWeek: days ?? [], startTime, endTime },
          ...others.filter((item) => item.id !== commitment?.id),
        ])
          .filter((overlap) => overlap.a === '__draft__')
          .map((overlap) => ({
            title: others.find((item) => item.id === overlap.b)?.title ?? '',
            daysOfWeek: overlap.daysOfWeek,
          }))
      : [];

  // Load the entity (or the saved draft of a new one) each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    reset(commitment ? { ...commitment } : { ...EMPTY, ...draft });
    // `draft` is read once on open on purpose: typing must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, commitment, reset]);

  const close = () => {
    // Keep an unfinished new commitment so an accidental dismissal loses nothing.
    if (!editing && isDirty) dispatch(commitmentDraftSaved(getValues() as FixedCommitmentInput));
    onClose();
  };

  const onSubmit = handleSubmit(async (input) => {
    try {
      await save.mutateAsync({ id: commitment?.id, input });
      if (!editing) dispatch(commitmentDraftSaved(null));
      toast.success(editing ? 'Compromisso atualizado' : 'Compromisso criado');
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Não foi possível salvar o compromisso.'));
    }
  });

  return (
    <Sheet
      open={open}
      onClose={close}
      title={editing ? 'Editar compromisso' : 'Novo compromisso'}
      description="Compromissos se repetem toda semana e nunca recebem tarefas por cima."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="commitment-form" loading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="commitment-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Título"
          placeholder="Ex.: Trabalho, Academia"
          autoComplete="off"
          data-autofocus
          error={errors.title?.message}
          {...register('title')}
        />

        <Controller
          control={control}
          name="daysOfWeek"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-footnote font-medium text-label-secondary">
                Dias da semana
              </legend>
              <div className="flex gap-1.5">
                {WEEKDAY_ORDER.map((day) => {
                  const selected = field.value.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      aria-label={WEEKDAY_LONG[day]}
                      onClick={() =>
                        field.onChange(
                          selected
                            ? field.value.filter((value) => value !== day)
                            : [...field.value, day].sort(),
                        )
                      }
                      className={cn(
                        'pressable h-11 flex-1 rounded-control text-footnote font-medium',
                        selected
                          ? 'bg-accent text-on-accent'
                          : 'bg-fill text-label-secondary hover:bg-fill-strong',
                      )}
                    >
                      {WEEKDAY_SHORT[day]}
                    </button>
                  );
                })}
              </div>
              {errors.daysOfWeek?.message ? (
                <p role="alert" className="text-footnote text-danger">
                  {errors.daysOfWeek.message}
                </p>
              ) : null}
            </fieldset>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Início"
            type="time"
            step={900}
            error={errors.startTime?.message}
            {...register('startTime')}
          />
          <Input
            label="Fim"
            type="time"
            step={900}
            error={errors.endTime?.message}
            {...register('endTime')}
          />
        </div>

        {overlapping.length > 0 ? (
          <Banner tone="warning" title="Sobrepõe outro compromisso">
            {overlapping
              .map((item) => `${item.title} (${formatWeekdays(item.daysOfWeek)})`)
              .join(', ')}
            . Você pode salvar assim mesmo: a rotina trata os dois horários como ocupados.
          </Banner>
        ) : null}

        <label className="flex items-start gap-3 text-body">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-(--accent)"
            {...register('requiresTravel')}
          />
          <span>
            <span className="font-medium">Exige deslocamento depois</span>
            <span className="block text-footnote text-label-secondary">
              Reserva o tempo de deslocamento (definido em Ajustes) após o último compromisso assim
              do dia.
            </span>
          </span>
        </label>

        <Select label="Categoria" error={errors.category?.message} {...register('category')}>
          {COMMITMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABEL[category]}
            </option>
          ))}
        </Select>

        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-footnote font-medium text-label-secondary">Cor</legend>
              <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
                {COMMITMENT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={field.value === color}
                    aria-label={COLOR_LABEL[color]}
                    title={COLOR_LABEL[color]}
                    onClick={() => field.onChange(color)}
                    style={toneStyle(color)}
                    className={cn(
                      'pressable tone-solid size-11 rounded-full ring-offset-2 ring-offset-surface-raised',
                      field.value === color && 'ring-2 ring-label',
                    )}
                  />
                ))}
              </div>
            </fieldset>
          )}
        />
      </form>
    </Sheet>
  );
}
