import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Icon, type IconName } from './icon';

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={cn('skeleton rounded-control', className)} style={style} />
  );
}

/** Announces a loading region once, instead of every skeleton row. */
export function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-fill text-label-secondary">
        <Icon name={icon} size={24} />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-headline font-semibold">{title}</h2>
        <p className="text-body text-label-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Não foi possível carregar',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-fill text-danger">
        <Icon name="alert" size={24} />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-headline font-semibold">{title}</h2>
        <p className="text-body text-label-secondary">{message}</p>
      </div>
      {onRetry ? (
        <Button icon="refresh" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export type Tone = 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'teal' | 'red' | 'gray';

export const toneStyle = (tone: Tone): CSSProperties =>
  ({ '--tone': `var(--tone-${tone})` }) as CSSProperties;

interface BadgeProps {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'gray', icon, children, className }: BadgeProps) {
  return (
    <span
      style={toneStyle(tone)}
      className={cn(
        'tone-surface inline-flex h-6 items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

interface BannerProps {
  tone?: 'info' | 'warning';
  icon?: IconName;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

/** Inline status message placed next to what it is about. */
export function Banner({ tone = 'info', icon, title, children, actions }: BannerProps) {
  return (
    <div
      role="status"
      style={toneStyle(tone === 'warning' ? 'orange' : 'blue')}
      className="tone-surface flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card px-4 py-3"
    >
      <Icon name={icon ?? (tone === 'warning' ? 'alert' : 'info')} className="shrink-0" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-body font-semibold text-label">{title}</p>
        {children ? <div className="text-footnote text-label-secondary">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
