import type { ReactNode } from 'react';

/** Centered card shared by the login and signup screens. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <p className="text-headline font-semibold tracking-tight">Routinely</p>
        <h1 className="mt-4 text-display font-bold">{title}</h1>
        {description ? <p className="mt-1 text-body text-label-secondary">{description}</p> : null}
      </div>
      <div className="rounded-card bg-surface p-5 shadow-card sm:p-6">{children}</div>
      {footer ? (
        <div className="text-center text-footnote text-label-secondary">{footer}</div>
      ) : null}
    </div>
  );
}
