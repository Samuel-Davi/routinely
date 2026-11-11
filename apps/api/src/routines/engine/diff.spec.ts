import { diffBlocks } from './diff';
import { block } from './fixtures';

describe('diffBlocks', () => {
  const a1 = block('a', '2026-11-09T17:00', '2026-11-09T18:00');
  const a2 = block('a', '2026-11-10T17:00', '2026-11-10T18:00');
  const b1 = block('b', '2026-11-09T19:00', '2026-11-09T20:00');

  it('reports nothing for identical versions', () => {
    expect(diffBlocks([a1, b1], [b1, a1])).toEqual({ added: 0, removed: 0, moved: 0, kept: 2 });
  });

  it('counts a block of the same task at another time as moved', () => {
    expect(diffBlocks([a1, b1], [a2, b1])).toEqual({ added: 0, removed: 0, moved: 1, kept: 1 });
  });

  it('counts new and dropped blocks', () => {
    expect(diffBlocks([a1], [a1, b1])).toEqual({ added: 1, removed: 0, moved: 0, kept: 1 });
    expect(diffBlocks([a1, b1], [a1])).toEqual({ added: 0, removed: 1, moved: 0, kept: 1 });
  });

  it('combines moves with a change in the number of blocks', () => {
    const a3 = block('a', '2026-11-11T17:00', '2026-11-11T18:00');
    expect(diffBlocks([a1], [a2, a3])).toEqual({ added: 1, removed: 0, moved: 1, kept: 0 });
    expect(diffBlocks([a2, a3], [a1])).toEqual({ added: 0, removed: 1, moved: 1, kept: 0 });
  });

  it('handles the first version and an emptied routine', () => {
    expect(diffBlocks([], [a1, b1])).toEqual({ added: 2, removed: 0, moved: 0, kept: 0 });
    expect(diffBlocks([a1, b1], [])).toEqual({ added: 0, removed: 2, moved: 0, kept: 0 });
    expect(diffBlocks([], [])).toEqual({ added: 0, removed: 0, moved: 0, kept: 0 });
  });

  it('handles duplicated identical blocks', () => {
    expect(diffBlocks([a1, a1], [a1])).toEqual({ added: 0, removed: 1, moved: 0, kept: 1 });
  });
});
