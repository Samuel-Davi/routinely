import { cn } from '@/lib/cn';

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block rounded-full border-2 border-current border-r-transparent',
        className,
      )}
      style={{ width: size, height: size, animation: 'spin 0.7s linear infinite' }}
    />
  );
}
