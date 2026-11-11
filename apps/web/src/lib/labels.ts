import type {
  CommitmentCategory,
  CommitmentColor,
  EstimationSource,
  PlacementViolation,
  Priority,
  ReplanReason,
  RoutineSource,
  RoutineTrigger,
  TaskStatus,
  UnscheduledReason,
} from '@routinely/shared';
import type { Tone } from '@/components/ui/feedback';

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const PRIORITY_TONE: Record<Priority, Tone> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'A fazer',
  SCHEDULED: 'Agendada',
  DONE: 'Concluída',
};

export const CATEGORY_LABEL: Record<CommitmentCategory, string> = {
  WORK: 'Trabalho',
  STUDY: 'Estudo',
  HEALTH: 'Saúde',
  PERSONAL: 'Pessoal',
  OTHER: 'Outro',
};

export const COLOR_LABEL: Record<CommitmentColor, string> = {
  blue: 'Azul',
  green: 'Verde',
  orange: 'Laranja',
  purple: 'Roxo',
  pink: 'Rosa',
  teal: 'Turquesa',
  red: 'Vermelho',
  gray: 'Cinza',
};

export const ESTIMATION_SOURCE_LABEL: Record<EstimationSource, string> = {
  AI: 'Estimado por IA',
  MANUAL: 'Ajustado por você',
  HEURISTIC: 'Estimativa sem IA',
};

export const ROUTINE_SOURCE_LABEL: Record<RoutineSource, string> = {
  AI: 'Gerada com IA',
  AI_REPAIRED: 'IA + correção automática',
  HEURISTIC: 'Gerada sem IA',
};

export const ROUTINE_TRIGGER_LABEL: Record<RoutineTrigger, string> = {
  GENERATE: 'Geração',
  REPLAN: 'Replanejamento',
  RESTORE: 'Restauração',
};

export const UNSCHEDULED_REASON_LABEL: Record<UnscheduledReason, string> = {
  DEADLINE_IMPOSSIBLE: 'Não cabe antes do prazo',
  DEADLINE_PASSED: 'O prazo já passou',
  TOO_LONG_FOR_BLOCK: 'É maior que um bloco de foco e não pode ser dividida',
  NO_FREE_TIME: 'Sem horário livre no período planejado',
  NOT_ESTIMATED: 'Ainda sem estimativa de duração',
};

export const VIOLATION_LABEL: Record<PlacementViolation, string> = {
  INVALID_RANGE: 'Horário inválido',
  OFF_GRID: 'Use intervalos de 15 minutos',
  CROSSES_DAYS: 'O bloco não pode atravessar dois dias',
  OUTSIDE_DAY_WINDOW: 'Fora da sua janela diária',
  OVERLAPS_LUNCH: 'Invade o horário de almoço/descanso',
  OVERLAPS_COMMITMENT: 'Conflita com um compromisso fixo',
  OVERLAPS_BLOCK: 'Conflita com outro bloco',
  AFTER_DEADLINE: 'Passa do prazo da tarefa',
  EXCEEDS_MAX_BLOCK: 'Maior que a duração máxima de um bloco',
  IN_THE_PAST: 'Este horário já passou',
};

export function replanReasonLabel(code: ReplanReason, count: number): string {
  const plural = count > 1;
  switch (code) {
    case 'OVERDUE_BLOCK':
      return plural ? `${count} blocos ficaram para trás` : '1 bloco ficou para trás';
    case 'NEW_TASK':
      return plural ? `${count} tarefas novas` : '1 tarefa nova';
    case 'TASK_CHANGED':
      return plural ? `${count} tarefas mudaram` : '1 tarefa mudou';
    case 'SCHEDULE_CHANGED':
      return 'seus compromissos ou preferências mudaram';
  }
}

/** Short weekday names indexed by `Date#getDay()` (0 = domingo). */
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export const WEEKDAY_LONG = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;
/** Weekdays in display order: Monday first, matching the calendar. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** `[1,2,3,4,5]` → "Seg a Sex"; `[1,3]` → "Seg, Qua". */
export function formatWeekdays(days: readonly number[]): string {
  const ordered = WEEKDAY_ORDER.filter((day) => days.includes(day));
  if (ordered.length === 7) return 'Todos os dias';
  const positions = ordered.map((day) => WEEKDAY_ORDER.indexOf(day));
  const consecutive = positions.every(
    (position, index) => index === 0 || position === (positions[index - 1] as number) + 1,
  );
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (consecutive && ordered.length >= 3 && first !== undefined && last !== undefined) {
    return `${WEEKDAY_SHORT[first]} a ${WEEKDAY_SHORT[last]}`;
  }
  return ordered.map((day) => WEEKDAY_SHORT[day]).join(', ');
}

/** `90` → "1h30"; `45` → "45 min"; `120` → "2h". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

export function formatTime(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(instant),
  );
}

export function formatDateTime(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant));
}

/** `2026-11-10` → "10 de nov." (pure calendar date, no timezone shift). */
export function formatDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
): string {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** "em 3 dias", "hoje", "amanhã", "atrasada há 2 dias". */
export function formatRelativeDeadline(
  deadline: string,
  now: number = Date.now(),
): { text: string; overdue: boolean } {
  const diff = Date.parse(deadline) - now;
  const hours = Math.round(Math.abs(diff) / 3_600_000);
  const days = Math.round(Math.abs(diff) / 86_400_000);
  if (diff < 0) {
    return {
      overdue: true,
      text:
        hours < 24
          ? `atrasada há ${Math.max(1, hours)}h`
          : `atrasada há ${days} ${days === 1 ? 'dia' : 'dias'}`,
    };
  }
  if (hours < 1) return { overdue: false, text: 'em menos de 1h' };
  if (hours < 24) return { overdue: false, text: `em ${hours}h` };
  return { overdue: false, text: days === 1 ? 'amanhã' : `em ${days} dias` };
}
