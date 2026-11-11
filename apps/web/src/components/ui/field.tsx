import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-control bg-fill px-3 text-body text-label placeholder:text-label-tertiary ' +
  'border border-transparent transition-colors duration-150 ' +
  'hover:bg-fill-strong focus:bg-surface focus:border-accent-text focus:outline-none ' +
  'aria-[invalid=true]:border-danger disabled:opacity-50';

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

/** Label + control + inline validation message, wired for assistive tech. */
function FieldShell({ id, label, error, hint, className, children }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-footnote font-medium text-label-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-footnote text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-footnote text-label-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface CommonProps {
  label: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, CommonProps {
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  error,
  hint,
  containerClassName,
  className,
  id,
  ...props
}: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} className={containerClassName}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(CONTROL, 'h-11', className)}
        {...props}
      />
    </FieldShell>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, CommonProps {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  error,
  hint,
  containerClassName,
  className,
  id,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} className={containerClassName}>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(CONTROL, 'min-h-20 resize-y py-2', className)}
        {...props}
      />
    </FieldShell>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, CommonProps {
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

export function Select({
  label,
  error,
  hint,
  containerClassName,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} className={containerClassName}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(CONTROL, 'h-11 appearance-none pr-8', className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}
