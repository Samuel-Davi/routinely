'use client';

import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { useTheme, type ThemeChoice } from '@/lib/theme';

const OPTIONS: readonly { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: 'system', label: 'Tema do sistema', icon: 'monitor' },
  { value: 'light', label: 'Tema claro', icon: 'sun' },
  { value: 'dark', label: 'Tema escuro', icon: 'moon' },
];

/** Light, dark or the system's: three icon segments, a radio group for assistive tech. */
export function ThemeSwitch({ className }: { className?: string }) {
  const [choice, setChoice] = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn('grid grid-cols-3 gap-0.5 rounded-control bg-fill p-0.5', className)}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === choice;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => setChoice(option.value)}
            className={cn(
              'pressable flex h-11 items-center justify-center rounded-[0.375rem]',
              selected
                ? 'bg-surface-raised text-label shadow-card'
                : 'text-label-secondary hover:text-label',
            )}
          >
            <Icon name={option.icon} size={18} />
          </button>
        );
      })}
    </div>
  );
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

/** Phones: one button that steps through system → light → dark. */
export function ThemeCycleButton() {
  const [choice, setChoice] = useTheme();
  const current = OPTIONS.find((option) => option.value === choice) ?? OPTIONS[0];
  return (
    <button
      type="button"
      aria-label={`${current?.label ?? 'Tema'}. Tocar para trocar`}
      title={current?.label}
      onClick={() => setChoice(NEXT[choice])}
      className="pressable flex size-11 items-center justify-center rounded-full text-label-secondary hover:bg-fill hover:text-label"
    >
      <Icon name={current?.icon ?? 'monitor'} size={20} />
    </button>
  );
}
