'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './icon';

interface MenuProps {
  /** Accessible name of the trigger (it shows only an icon). */
  label: string;
  icon?: IconName;
  /** Small dot on the trigger: something inside is switched on (e.g. active filters). */
  indicator?: boolean;
  children: (close: () => void) => ReactNode;
  className?: string;
}

/**
 * Disclosure menu for secondary actions, so a screen has one primary action and one place for
 * the rest. Keyboard: Enter/Space opens, arrows move, Escape closes and returns focus.
 */
export function Menu({ label, icon = 'more', indicator, children, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const close = () => setOpen(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    // Closing returns focus to the trigger (unless a click elsewhere moved it on purpose).
    if (!open && wasOpen.current && rootRef.current?.contains(document.activeElement ?? null)) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
    if (!open) return undefined;
    // Focus the first item as soon as the menu opens.
    const first = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    first.find((item) => item.offsetParent !== null)?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        wasOpen.current = false; // the user went elsewhere: do not steal focus back
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []),
    ].filter((item) => item.offsetParent !== null);
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className={cn('relative', className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        className="pressable relative inline-flex size-11 items-center justify-center rounded-full bg-fill text-label hover:bg-fill-strong"
      >
        <Icon name={icon} size={20} />
        {indicator ? (
          <span
            aria-hidden="true"
            className="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent"
          />
        ) : null}
      </button>
      {open ? (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-card bg-surface-raised p-1.5 shadow-float"
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

interface MenuItemProps {
  icon?: IconName;
  children: ReactNode;
  onSelect: () => void;
  /** For choices that are on/off or one-of-many. */
  checked?: boolean;
  /** Right-aligned secondary text, e.g. a count. */
  detail?: string;
  disabled?: boolean;
}

export function MenuItem({ icon, children, onSelect, checked, detail, disabled }: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className="pressable flex h-11 w-full items-center gap-3 rounded-control px-3 text-left text-body text-label hover:bg-fill focus-visible:bg-fill disabled:opacity-40"
    >
      {icon ? <Icon name={icon} size={18} className="shrink-0 text-label-secondary" /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail ? <span className="text-footnote text-label-tertiary">{detail}</span> : null}
      {checked ? <Icon name="check" size={16} className="shrink-0 text-accent-text" /> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-hairline" />;
}
