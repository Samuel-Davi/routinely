import Link from 'next/link';
import type { ReactNode } from 'react';
import { UserMenu } from '@/features/auth/user-menu';
import { TabBarLinks, TopNavLinks } from './nav-links';

/**
 * Page frame. Navigation is translucent floating chrome: a top bar on wide
 * screens and a tab bar within thumb reach on phones. Content scrolls under it.
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
      <header className="material sticky top-0 z-40 border-b border-separator">
        <nav
          aria-label="Principal"
          className="mx-auto flex h-(--nav-height) max-w-7xl items-center gap-6 px-4 sm:px-6"
        >
          <Link href="/" className="text-headline font-semibold tracking-tight">
            Routinely
          </Link>
          <div className="hidden md:block">
            <TopNavLinks />
          </div>
          <UserMenu />
        </nav>
      </header>
      <main
        id="conteudo"
        className="mx-auto w-full max-w-7xl px-4 pt-6 pb-[calc(var(--tabbar-height)+2rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-12"
      >
        {children}
      </main>
      <nav
        aria-label="Principal"
        className="material fixed inset-x-0 bottom-0 z-40 border-t border-separator pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <TabBarLinks />
      </nav>
    </>
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
