import { makeBlock, makeRoutine, uuid } from '@/test/fixtures';
import { compareRuns, describeRun } from './run-result';

const at = (hour: number) => `2026-11-10T${String(hour).padStart(2, '0')}:00:00.000Z`;

describe('compareRuns', () => {
  it('counts every block as new on the first generation, with nothing to undo', () => {
    const next = makeRoutine({
      id: uuid(50),
      blocks: [makeBlock({ id: uuid(51), taskId: uuid(1) })],
    });
    const result = compareRuns(null, next);
    expect(result).toMatchObject({ previousRoutineId: null, total: 1, added: 1, moved: 0 });
    expect(result.changedBlockIds).toEqual([uuid(51)]);
  });

  it('tells kept, moved and added blocks apart by task and time', () => {
    const previous = makeRoutine({
      id: uuid(40),
      blocks: [
        makeBlock({ id: uuid(41), taskId: uuid(1), start: at(20), end: at(21) }),
        makeBlock({ id: uuid(42), taskId: uuid(2), start: at(20), end: at(21) }),
      ],
    });
    const next = makeRoutine({
      id: uuid(50),
      blocks: [
        makeBlock({ id: uuid(51), taskId: uuid(1), start: at(20), end: at(21) }),
        makeBlock({ id: uuid(52), taskId: uuid(2), start: at(21), end: at(22) }),
        makeBlock({ id: uuid(53), taskId: uuid(3), start: at(22), end: at(23) }),
      ],
    });
    const result = compareRuns(previous, next);
    expect(result).toMatchObject({
      previousRoutineId: uuid(40),
      total: 3,
      kept: 1,
      moved: 1,
      added: 1,
    });
    expect(result.changedBlockIds).toEqual([uuid(52), uuid(53)]);
    expect(describeRun(result)).toBe('3 blocos · 1 novo · 1 movido');
  });

  it('describes a run with no change by its total alone', () => {
    const routine = makeRoutine({ id: uuid(50), blocks: [makeBlock({ id: uuid(51) })] });
    const result = compareRuns({ ...routine, id: uuid(40) }, routine);
    expect(result.changedBlockIds).toEqual([]);
    expect(describeRun(result)).toBe('1 bloco');
  });
});
