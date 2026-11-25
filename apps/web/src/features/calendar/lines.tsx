'use client';

import type { FixedCommitment } from '@routinely/shared';
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { toneStyle, type Tone } from '@/components/ui';

/**
 * Every fixed commitment has its colour, and a task linked to it carries that colour as a dot;
 * tasks with no commitment are grey ("Sem compromisso"). Order: oldest commitment first.
 */
export interface TransitLine {
  /** 1-based line number, stable for a list of commitments (oldest first). */
  number: number | null;
  tone: Tone;
  title: string;
}

export const FREE_LINE: TransitLine = { number: null, tone: 'gray', title: 'Sem compromisso' };

export function buildLines(commitments: readonly FixedCommitment[]): Map<string, TransitLine> {
  const ordered = [...commitments].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  return new Map(
    ordered.map((commitment, index) => [
      commitment.id,
      { number: index + 1, tone: commitment.color as Tone, title: commitment.title },
    ]),
  );
}

/** The commitment's colour on an element: `--tone`, and `--tone-on` for text on a solid fill. */
export function lineStyle(line: TransitLine): CSSProperties {
  return toneStyle(line.tone);
}

const LinesContext = createContext<Map<string, TransitLine>>(new Map());

export function LinesProvider({
  commitments,
  children,
}: {
  commitments: readonly FixedCommitment[];
  children: ReactNode;
}) {
  const lines = useMemo(() => buildLines(commitments), [commitments]);
  return <LinesContext.Provider value={lines}>{children}</LinesContext.Provider>;
}

/** The line a commitment (or a task's commitment) belongs to. */
export function useLine(commitmentId: string | null | undefined): TransitLine {
  const lines = useContext(LinesContext);
  return (commitmentId ? lines.get(commitmentId) : undefined) ?? FREE_LINE;
}

/** Commitment ids in line-number order. */
export function useLineOrder(): string[] {
  const lines = useContext(LinesContext);
  return useMemo(() => [...lines.keys()], [lines]);
}

/** The commitment's colour dot. */
export function LineBadge({ line, size = 8 }: { line: TransitLine; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ ...lineStyle(line), width: size, height: size }}
      className="inline-block shrink-0 rounded-full bg-(--tone)"
    />
  );
}

/** The colour key: the commitments in the visible days, then "Sem compromisso". */
export function LinesLegend({ commitmentIds }: { commitmentIds: ReadonlySet<string> }) {
  const lines = useContext(LinesContext);
  const running = [...lines.entries()]
    .filter(([id]) => commitmentIds.has(id))
    .map(([, line]) => line);
  return (
    <ul
      aria-label="Compromissos da semana"
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-hairline px-4 py-2.5"
    >
      {[...running, FREE_LINE].map((line) => (
        <li
          key={line.number ?? 'free'}
          className="flex items-center gap-1.5 text-caption font-medium text-label-secondary"
        >
          <LineBadge line={line} />
          {line.title}
        </li>
      ))}
    </ul>
  );
}
