import Link from 'next/link';
import type { ReactNode } from 'react';
import { UserMenu } from '@/features/auth/user-menu';
import { SidebarLinks, TabBarLinks } from './nav-links';
import { ThemeCycleButton, ThemeSwitch } from './theme-switch';

/**
 * Page frame. Wide screens: a light sidebar with navigation, the theme switch and the account.
 * Phones: a slim top bar and a tab bar within thumb reach.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-float"
      >
        Pular para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-(--sidebar-width) flex-col border-r border-shell-edge bg-shell md:flex">
        <div className="flex h-(--nav-height) items-center px-4">
          <Wordmark />
        </div>
        <nav aria-label="Principal" className="flex-1 px-3 pt-2">
          <SidebarLinks />
        </nav>
        <div className="flex flex-col gap-3 border-t border-shell-edge p-3">
          <ThemeSwitch />
          <UserMenu />
        </div>
      </aside>

      <header className="material sticky top-0 z-40 border-b border-separator md:hidden">
        <div className="flex h-(--nav-height) items-center gap-2 px-4">
          <Wordmark />
          <div className="ml-auto flex items-center gap-1">
            <ThemeCycleButton />
            <UserMenu compact />
          </div>
        </div>
      </header>

      <main
        id="conteudo"
        className="w-full px-4 pt-6 pb-[calc(var(--tabbar-height)+2rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-12 md:pl-[calc(var(--sidebar-width)+1.5rem)] lg:pr-8"
      >
        <div className="mx-auto max-w-[96rem]">{children}</div>
      </main>

      <nav
        aria-label="Abas"
        className="material fixed inset-x-0 bottom-0 z-40 border-t border-separator pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <TabBarLinks />
      </nav>
    </>
  );
}

/** The brand: an indigo tile with a check over a week's rows, and the name. */
function Wordmark() {
  return (
    <Link
      href="/"
      className="flex h-11 items-center gap-2 text-headline font-bold tracking-[-0.01em]"
    >
      <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect width="26" height="26" rx="7" fill="var(--accent)" />
        <path
          d="M7 9h12M7 13h7M7 17h5"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M15.5 17l2 2 4-4.5"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Routinely
    </Link>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-display font-bold">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-body text-label-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
