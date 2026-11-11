'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

// Destinations are named for what they contain, not generic umbrellas.
export const DESTINATIONS: readonly { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Semana', icon: 'calendar' },
  { href: '/tarefas', label: 'Tarefas', icon: 'checklist' },
  { href: '/compromissos', label: 'Compromissos', icon: 'repeat' },
  { href: '/historico', label: 'Histórico', icon: 'history' },
  { href: '/preferencias', label: 'Ajustes', icon: 'settings' },
];

const isCurrent = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);

/** Horizontal links for the desktop top bar. */
export function TopNavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {DESTINATIONS.map(({ href, label }) => {
        const current = isCurrent(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'pressable flex h-8 items-center rounded-full px-3 text-footnote font-medium',
                current ? 'bg-fill text-label' : 'text-label-secondary hover:text-label',
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Icon + label tabs for the phone tab bar. */
export function TabBarLinks() {
  const pathname = usePathname();
  return (
    <ul className="mx-auto flex h-(--tabbar-height) max-w-lg items-stretch justify-around px-1">
      {DESTINATIONS.map(({ href, label, icon }) => {
        const current = isCurrent(pathname, href);
        return (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'pressable flex h-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium tracking-[0.01em]',
                current ? 'text-accent-text' : 'text-label-secondary',
              )}
            >
              <Icon name={icon} size={22} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
