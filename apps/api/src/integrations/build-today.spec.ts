import { fromLocalDateTime } from '@routinely/shared';
import { buildToday, type TodayInput } from './build-today';

const TZ = 'America/Manaus'; // UTC-4, no DST
const at = (local: string, tz = TZ) => new Date(fromLocalDateTime(local, tz));

function input(overrides: Partial<TodayInput> = {}): TodayInput {
  return {
    date: '2026-11-24', // a Tuesday
    timezone: TZ,
    blocks: [],
    commitments: [],
    tasks: [],
    routineNotice: null,
    ...overrides,
  };
}

const block = (start: string, end: string, title = 'Estudar', completed = false) => ({
  start: at(start),
  end: at(end),
  locked: false,
  completedAt: completed ? at(end) : null,
  task: { title, priority: 'HIGH' as const },
});

describe('buildToday', () => {
  it('returns empty lists when there is no routine nor data', () => {
    expect(buildToday(input())).toEqual({
      date: '2026-11-24',
      timezone: TZ,
      blocks: [],
      commitments: [],
      tasksDue: [],
      routineNotice: null,
    });
  });

  it('lists the blocks of the day in local time, sorted, with their state', () => {
    const today = buildToday(
      input({
        blocks: [
          block('2026-11-24T14:00', '2026-11-24T15:00', 'Relatório', true),
          block('2026-11-24T09:00', '2026-11-24T10:30'),
          block('2026-11-25T09:00', '2026-11-25T10:00', 'Amanhã'),
          block('2026-11-23T09:00', '2026-11-23T10:00', 'Ontem'),
        ],
        routineNotice: 'Rotina gerada sem IA.',
      }),
    );
    expect(today.blocks).toEqual([
      {
        start: '09:00',
        end: '10:30',
        title: 'Estudar',
        done: false,
        locked: false,
        priority: 'HIGH',
      },
      {
        start: '14:00',
        end: '15:00',
        title: 'Relatório',
        done: true,
        locked: false,
        priority: 'HIGH',
      },
    ]);
    expect(today.routineNotice).toBe('Rotina gerada sem IA.');
  });

  it('uses the user timezone to decide which day an instant belongs to', () => {
    // 02:30 UTC on the 25th is still 22:30 of the 24th in Manaus.
    const late = {
      ...block('2026-11-24T22:30', '2026-11-24T23:30'),
      start: new Date('2026-11-25T02:30:00Z'),
      end: new Date('2026-11-25T03:30:00Z'),
    };
    expect(buildToday(input({ blocks: [late] })).blocks[0]).toMatchObject({
      start: '22:30',
      end: '23:30',
    });
    // The same instants are already the 25th in São Paulo (UTC-3)… and 23:30-00:30 there.
    expect(
      buildToday(input({ timezone: 'America/Sao_Paulo', blocks: [late] })).blocks[0],
    ).toMatchObject({ start: '23:30', end: '24:00' });
  });

  it('clips a block that crosses midnight to the requested day', () => {
    const night = block('2026-11-23T23:00', '2026-11-24T01:00', 'Virada');
    const late = block('2026-11-24T23:30', '2026-11-25T00:30', 'Madrugada');
    const today = buildToday(input({ blocks: [night, late] }));
    expect(today.blocks.map(({ start, end, title }) => ({ start, end, title }))).toEqual([
      { start: '00:00', end: '01:00', title: 'Virada' },
      { start: '23:30', end: '24:00', title: 'Madrugada' },
    ]);
    expect(buildToday(input({ date: '2026-11-25', blocks: [late] })).blocks[0]).toMatchObject({
      start: '00:00',
      end: '00:30',
    });
  });

  it('includes weekly commitments by weekday and one-off ones only on their date', () => {
    const today = buildToday(
      input({
        commitments: [
          { title: 'Inglês', daysOfWeek: [2], date: null, startTime: '14:00', endTime: '16:00' },
          {
            title: 'Academia',
            daysOfWeek: [1, 3],
            date: null,
            startTime: '07:00',
            endTime: '08:00',
          },
          {
            title: 'Dentista',
            daysOfWeek: [2],
            date: '2026-11-24',
            startTime: '10:00',
            endTime: '11:00',
          },
          // Same weekday, other date: a one-off ignores `daysOfWeek`.
          {
            title: 'Exame',
            daysOfWeek: [2],
            date: '2026-12-01',
            startTime: '08:00',
            endTime: '09:00',
          },
        ],
      }),
    );
    expect(today.commitments).toEqual([
      { start: '10:00', end: '11:00', title: 'Dentista', oneOff: true },
      { start: '14:00', end: '16:00', title: 'Inglês', oneOff: false },
    ]);
  });

  it('lists the tasks due on the day, in local time', () => {
    const today = buildToday(
      input({
        tasks: [
          {
            title: 'Entregar TCC',
            deadline: at('2026-11-24T23:59'),
            priority: 'URGENT',
            status: 'SCHEDULED',
          },
          {
            title: 'Pagar conta',
            deadline: at('2026-11-24T00:00'),
            priority: 'LOW',
            status: 'DONE',
          },
          { title: 'Amanhã', deadline: at('2026-11-25T00:00'), priority: 'LOW', status: 'TODO' },
        ],
      }),
    );
    expect(today.tasksDue).toEqual([
      { title: 'Pagar conta', dueDate: '2026-11-24', priority: 'LOW', done: true },
      { title: 'Entregar TCC', dueDate: '2026-11-24', priority: 'URGENT', done: false },
    ]);
  });
});
