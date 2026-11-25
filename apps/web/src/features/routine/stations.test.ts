import { makeBlock, makeRoutine, makeTask, uuid } from '@/test/fixtures';
import { buildStations } from './stations';

const WEEK = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
  '2026-11-15',
];
const TZ = 'America/Manaus';

describe('buildStations', () => {
  it('groups open tasks by line, free line last, nearest deadline first', () => {
    const line = uuid(80);
    const tasks = [
      makeTask({ id: uuid(1), commitmentId: null, deadline: '2026-11-14T22:00:00.000Z' }),
      makeTask({ id: uuid(2), commitmentId: line, deadline: '2026-11-13T22:00:00.000Z' }),
      makeTask({ id: uuid(3), commitmentId: null, deadline: '2026-11-11T22:00:00.000Z' }),
      makeTask({ id: uuid(4), status: 'DONE' }),
    ];
    const groups = buildStations(tasks, null, WEEK, TZ, [line]);
    expect(groups.map((group) => group.commitmentId)).toEqual([line, null]);
    expect(groups[1]?.stations.map((station) => station.task.id)).toEqual([uuid(3), uuid(1)]);
  });

  it('sums the minutes on the visible week and flags tasks that did not fit', () => {
    const routine = makeRoutine({
      blocks: [
        makeBlock({
          taskId: uuid(1),
          start: '2026-11-10T20:00:00.000Z',
          end: '2026-11-10T21:30:00.000Z',
        }),
        // next week: not counted
        makeBlock({
          taskId: uuid(1),
          start: '2026-11-17T20:00:00.000Z',
          end: '2026-11-17T21:00:00.000Z',
        }),
      ],
      unscheduled: [
        { taskId: uuid(1), title: 'A', reason: 'PARTIAL', missingMinutes: 30 },
        { taskId: uuid(2), title: 'B', reason: 'NO_FREE_TIME', missingMinutes: 60 },
      ],
    });
    const tasks = [makeTask({ id: uuid(1) }), makeTask({ id: uuid(2) })];
    const [free] = buildStations(tasks, routine, WEEK, TZ, []);
    expect(free?.stations.map(({ weekMinutes, flag }) => [weekMinutes, flag])).toEqual([
      [90, 'PARTIAL'],
      [0, 'LEFT_OUT'],
    ]);
  });
});
