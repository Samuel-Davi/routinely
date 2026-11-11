import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatRelativeDeadline,
  formatTime,
  formatWeekdays,
  replanReasonLabel,
} from './labels';

describe('labels and formatters', () => {
  it('formats weekdays as ranges or lists, Monday first', () => {
    expect(formatWeekdays([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(formatWeekdays([5, 1, 3])).toBe('Seg, Qua, Sex');
    expect(formatWeekdays([0, 6])).toBe('Sáb, Dom');
    expect(formatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('Todos os dias');
    expect(formatWeekdays([2])).toBe('Ter');
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(125)).toBe('2h05');
  });

  it('formats instants in the given timezone', () => {
    expect(formatTime('2026-11-10T18:15:00.000Z', 'America/Manaus')).toBe('14:15');
    expect(formatDateTime('2026-11-10T18:15:00.000Z', 'America/Manaus')).toMatch(
      /ter.*10.*nov.*14:15/,
    );
    expect(formatDate('2026-11-10')).toMatch(/10 de nov/);
  });

  it('describes deadlines relative to now', () => {
    const now = Date.parse('2026-11-10T12:00:00.000Z');
    expect(formatRelativeDeadline('2026-11-10T12:20:00.000Z', now)).toEqual({
      overdue: false,
      text: 'em menos de 1h',
    });
    expect(formatRelativeDeadline('2026-11-10T17:00:00.000Z', now)).toEqual({
      overdue: false,
      text: 'em 5h',
    });
    expect(formatRelativeDeadline('2026-11-11T12:00:00.000Z', now)).toEqual({
      overdue: false,
      text: 'amanhã',
    });
    expect(formatRelativeDeadline('2026-11-13T12:00:00.000Z', now)).toEqual({
      overdue: false,
      text: 'em 3 dias',
    });
    expect(formatRelativeDeadline('2026-11-10T09:00:00.000Z', now)).toEqual({
      overdue: true,
      text: 'atrasada há 3h',
    });
    expect(formatRelativeDeadline('2026-11-08T12:00:00.000Z', now)).toEqual({
      overdue: true,
      text: 'atrasada há 2 dias',
    });
  });

  it('describes replan reasons with correct plurals', () => {
    expect(replanReasonLabel('NEW_TASK', 1)).toBe('1 tarefa nova');
    expect(replanReasonLabel('NEW_TASK', 3)).toBe('3 tarefas novas');
    expect(replanReasonLabel('OVERDUE_BLOCK', 2)).toBe('2 blocos ficaram para trás');
    expect(replanReasonLabel('TASK_CHANGED', 1)).toBe('1 tarefa mudou');
    expect(replanReasonLabel('SCHEDULE_CHANGED', 1)).toContain('compromissos');
  });
});
