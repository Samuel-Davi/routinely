import { DEFAULT_PREFERENCES } from '@routinely/shared';
import { makeBlock, makeCommitment } from '@/test/fixtures';
import {
  HOUR_HEIGHT,
  blocksForDay,
  boxFor,
  commitmentsForDay,
  deltaToMinutes,
  filterBlocks,
  formatWeekRange,
  gridBounds,
  gridHeight,
  hourLabels,
  instantAt,
  isBlockDone,
  nowOffset,
  offsetToMinutes,
  projectMomentum,
} from './layout';

const TZ = 'America/Manaus';
const bounds = gridBounds(DEFAULT_PREFERENCES); // 07:00–22:00

describe('calendar layout', () => {
  it('rounds the daily window outward to whole hours', () => {
    expect(bounds).toEqual({ startMinutes: 420, endMinutes: 1320 });
    expect(gridBounds({ dayStart: '06:30', dayEnd: '21:15' })).toEqual({
      startMinutes: 360,
      endMinutes: 1320,
    });
    expect(gridHeight(bounds)).toBe(15 * HOUR_HEIGHT);
    expect(hourLabels(bounds)).toHaveLength(16);
    expect(hourLabels(bounds)[0]).toBe(7);
  });

  it('positions and clips ranges', () => {
    expect(boxFor(480, 540, bounds)).toEqual({ top: HOUR_HEIGHT, height: HOUR_HEIGHT });
    expect(boxFor(360, 450, bounds)).toEqual({ top: 0, height: HOUR_HEIGHT / 2 });
    expect(boxFor(0, 300, bounds)).toBeNull();
  });

  it('places commitments on their weekdays only', () => {
    const commitments = [
      makeCommitment(),
      makeCommitment({ title: 'Academia', daysOfWeek: [1], startTime: '18:00', endTime: '19:00' }),
    ];
    const monday = commitmentsForDay('2026-11-09', commitments, bounds);
    expect(monday.map((item) => item.commitment.title)).toEqual(['Trabalho', 'Academia']);
    expect(monday[0]).toMatchObject({ top: HOUR_HEIGHT, height: 4 * HOUR_HEIGHT });
    expect(commitmentsForDay('2026-11-10', commitments, bounds)).toHaveLength(1);
    expect(commitmentsForDay('2026-11-14', commitments, bounds)).toEqual([]);
  });

  it('places blocks on the day they start, in the user timezone', () => {
    const lateBlock = makeBlock({
      start: '2026-11-10T01:00:00.000Z',
      end: '2026-11-10T02:00:00.000Z',
    }); // Mon 21:00 local
    const blocks = [makeBlock(), lateBlock];
    const monday = blocksForDay('2026-11-09', blocks, bounds, TZ);
    expect(monday).toHaveLength(2);
    expect(monday[0]).toMatchObject({
      startMinutes: 17 * 60,
      endMinutes: 18 * 60,
      top: 10 * HOUR_HEIGHT,
      height: HOUR_HEIGHT,
    });
    expect(blocksForDay('2026-11-10', blocks, bounds, TZ)).toEqual([]);
  });

  it('filters blocks by completion and priority', () => {
    const open = makeBlock();
    const done = makeBlock({ completedAt: '2026-11-09T22:00:00.000Z' });
    const doneTask = makeBlock({ task: { ...makeBlock().task, status: 'DONE', priority: 'LOW' } });
    expect(isBlockDone(open)).toBe(false);
    expect(isBlockDone(done)).toBe(true);
    expect(isBlockDone(doneTask)).toBe(true);
    const all = [open, done, doneTask];
    expect(filterBlocks(all, { showCompleted: true, priorities: [] })).toHaveLength(3);
    expect(filterBlocks(all, { showCompleted: false, priorities: [] })).toEqual([open]);
    expect(filterBlocks(all, { showCompleted: true, priorities: ['LOW'] })).toEqual([doneTask]);
  });

  it('converts pixels to grid minutes', () => {
    expect(offsetToMinutes(0, bounds)).toBe(420);
    expect(offsetToMinutes(HOUR_HEIGHT * 1.5, bounds)).toBe(510);
    expect(offsetToMinutes(HOUR_HEIGHT * 1.6, bounds)).toBe(510);
    expect(deltaToMinutes(HOUR_HEIGHT)).toBe(60);
    expect(deltaToMinutes(-HOUR_HEIGHT / 4)).toBe(-15);
    expect(deltaToMinutes(3)).toBe(0);
  });

  it('resolves instants and the now line', () => {
    expect(new Date(instantAt('2026-11-09', 17 * 60, TZ)).toISOString()).toBe(
      '2026-11-09T21:00:00.000Z',
    );
    const now = Date.parse('2026-11-09T14:30:00.000Z'); // 10:30 local
    expect(nowOffset('2026-11-09', now, bounds, TZ)).toBe(3.5 * HOUR_HEIGHT);
    expect(nowOffset('2026-11-10', now, bounds, TZ)).toBeNull();
    expect(nowOffset('2026-11-09', Date.parse('2026-11-09T09:00:00.000Z'), bounds, TZ)).toBeNull(); // 05:00, before the grid
  });

  it('projects swipe momentum', () => {
    expect(projectMomentum(0)).toBe(0);
    expect(projectMomentum(500)).toBeCloseTo(249.5, 1);
    expect(projectMomentum(-500)).toBeCloseTo(-249.5, 1);
  });

  it('formats the week range', () => {
    expect(formatWeekRange(['2026-11-09', '2026-11-15'])).toMatch(/^9 – 15 de nov\. de 2026$/);
    expect(formatWeekRange(['2026-11-30', '2026-12-06'])).toMatch(
      /^30 de nov\. – 6 de dez\. de 2026$/,
    );
    expect(formatWeekRange([])).toBe('');
  });
});
