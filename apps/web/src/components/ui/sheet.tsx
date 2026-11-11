'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Sticky action row at the bottom. */
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const subscribe = () => () => undefined;
/** True only on the client, so the portal never renders during SSR. */
const useIsClient = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/**
 * Modal task surface: a bottom sheet on phones, a centred card on larger
 * screens. It dims the content behind it, traps focus, closes on Escape and
 * returns focus to whatever opened it. It enters and leaves along the same path.
 */
export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const isClient = useIsClient();
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return event.preventDefault();
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!isClient) return null;

  // Critically damped spring: arrives without overshoot. Reduced motion → cross-fade.
  const transition = reducedMotion
    ? { duration: 0.15 }
    : ({ type: 'spring', bounce: 0, duration: 0.38 } as const);
  const hidden = reducedMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.98 };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={hidden}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={hidden}
            transition={transition}
            className="relative flex max-h-[92dvh] w-full flex-col rounded-t-sheet bg-surface-raised shadow-float outline-none sm:max-w-lg sm:rounded-sheet"
          >
            <header className="flex items-start gap-3 px-5 pt-5 pb-3">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-title font-semibold">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-0.5 text-footnote text-label-secondary">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton icon="close" label="Fechar" onClick={onClose} className="-mt-1 -mr-2" />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer ? (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-separator px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
