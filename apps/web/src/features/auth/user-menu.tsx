'use client';

import { IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLogout, useMe } from './api';

/**
 * Who is signed in, the demo seal when it applies, and the way out. The sidebar shows the full
 * row; `compact` (phones) keeps the seal short and the exit as an icon.
 */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const me = useMe();
  const logout = useLogout();
  if (!me.data) return null;
  // The demo account shows its seal instead of the shared account's name.
  const name = me.data.isDemo ? 'Modo demo' : me.data.name;

  return (
    <div className={cn('flex items-center gap-2', !compact && 'pl-1')}>
      {compact ? null : (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-footnote font-semibold text-accent-text"
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className={cn('min-w-0 flex-1', compact && 'sr-only')}>
        <span className="block truncate text-footnote font-semibold text-on-shell">{name}</span>
        {me.data.isDemo ? (
          <span className="block truncate text-caption text-on-shell-secondary">Sem IA</span>
        ) : null}
      </span>
      {compact && me.data.isDemo ? (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-caption font-semibold text-accent-text">
          Demo
        </span>
      ) : null}
      <IconButton
        icon="logout"
        label="Sair da conta"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      />
    </div>
  );
}
