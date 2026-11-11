'use client';

import { Badge, Button } from '@/components/ui';
import { useLogout, useMe } from './api';

/** Who is signed in, the demo seal when it applies, and the way out. */
export function UserMenu() {
  const me = useMe();
  const logout = useLogout();
  if (!me.data) return null;

  return (
    <div className="ml-auto flex items-center gap-2">
      {me.data.isDemo ? (
        <Badge tone="orange" icon="sparkles">
          Modo demo, sem IA
        </Badge>
      ) : (
        <span className="hidden max-w-40 truncate text-footnote text-label-secondary sm:inline">
          {me.data.name}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        loading={logout.isPending}
        onClick={() => logout.mutate()}
        aria-label="Sair da conta"
      >
        Sair
      </Button>
    </div>
  );
}
