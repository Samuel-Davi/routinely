'use client';

import { cn } from '@/lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A small set of mutually exclusive choices, exposed as a radio group. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-control bg-fill p-0.5', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const index = options.findIndex((item) => item.value === value);
              const next =
                options[
                  (index + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length
                ];
              if (next) onChange(next.value);
              const group = event.currentTarget.parentElement;
              requestAnimationFrame(() =>
                group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
              );
            }}
            className={cn(
              'pressable h-11 min-w-16 rounded-[0.5rem] px-3 text-footnote font-medium',
              selected
                ? 'bg-surface-raised text-label shadow-card'
                : 'text-label-secondary hover:text-label',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
