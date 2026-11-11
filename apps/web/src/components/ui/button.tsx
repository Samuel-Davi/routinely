import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './icon';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-fill text-label hover:bg-fill-strong',
  ghost: 'text-accent-text hover:bg-fill',
  danger: 'bg-fill text-danger hover:bg-fill-strong',
};

// Every size is at least 44px tall (Apple's minimum touch target); sizes differ by type and padding.
const SIZES: Record<Size, string> = {
  sm: 'h-11 px-3.5 text-footnote gap-1.5',
  md: 'h-11 px-4 text-body gap-2',
  lg: 'h-12 px-5 text-body gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  /** Shows a spinner and blocks repeated submits, keeping the label visible. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'pressable inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner size={size === 'sm' ? 12 : 16} />
      ) : icon ? (
        <Icon name={icon} size={size === 'sm' ? 16 : 18} />
      ) : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  size?: 'sm' | 'md';
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  size = 'md',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'pressable inline-flex shrink-0 items-center justify-center rounded-full text-label-secondary hover:bg-fill hover:text-label',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'size-11',
        className,
      )}
      {...props}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  );
}
