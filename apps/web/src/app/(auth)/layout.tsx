import type { ReactNode } from 'react';

/** Login and signup: no navigation, one centered card. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      {children}
    </main>
  );
}
