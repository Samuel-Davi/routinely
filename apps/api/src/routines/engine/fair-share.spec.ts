import { fairTargets } from './fair-share';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('fairTargets', () => {
  it('gives everyone what they need when it all fits', () => {
    expect(
      fairTargets(
        [
          { need: 120, deadlineIndex: 0 },
          { need: 60, deadlineIndex: 1 },
        ],
        [200, 100],
      ),
    ).toEqual([120, 60]);
  });

  it('splits scarce time with the same completion ratio when deadlines are equal', () => {
    const [a, b] = fairTargets(
      [
        { need: 480, deadlineIndex: 0 },
        { need: 480, deadlineIndex: 0 },
      ],
      [300],
    );
    expect(a).toBeCloseTo(150, 3);
    expect(b).toBeCloseTo(150, 3);
  });

  it('is proportional to need, not to a fixed share', () => {
    const [a, b] = fairTargets(
      [
        { need: 100, deadlineIndex: 0 },
        { need: 300, deadlineIndex: 0 },
      ],
      [200],
    );
    expect(a).toBeCloseTo(50, 3);
    expect(b).toBeCloseTo(150, 3);
  });

  it("lets the later-deadline task use the time the earlier one cannot reach (the author's case)", () => {
    // 180 min exist before the first deadline, 120 more before the second: 300 for 480 + 480.
    const [first, second] = fairTargets(
      [
        { need: 480, deadlineIndex: 0 },
        { need: 480, deadlineIndex: 1 },
      ],
      [180, 120],
    );
    expect(first).toBeCloseTo(150, 3);
    expect(second).toBeCloseTo(150, 3);
    expect((first as number) + (second as number)).toBeCloseTo(300, 3);
  });

  it('caps a task by its own deadline and gives the rest to the others', () => {
    // Only 60 min exist before the first deadline: that task cannot exceed 60, whatever its need.
    const [first, second] = fairTargets(
      [
        { need: 480, deadlineIndex: 0 },
        { need: 480, deadlineIndex: 1 },
      ],
      [60, 600],
    );
    expect(first).toBeCloseTo(60, 3);
    expect(second).toBeCloseTo(480, 3);
  });

  it('handles no tasks and no capacity', () => {
    expect(fairTargets([], [])).toEqual([]);
    // (the solver stops within a tiny tolerance of zero: placement rounds down to the 15 min grid)
    expect(fairTargets([{ need: 60, deadlineIndex: 0 }], [0])[0]).toBeCloseTo(0, 3);
  });

  it('never uses more than the capacity, for random inputs', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let round = 0; round < 200; round += 1) {
      const segments = 1 + Math.floor(random() * 4);
      const capacity = Array.from({ length: segments }, () => Math.floor(random() * 300));
      const tasks = Array.from({ length: 1 + Math.floor(random() * 5) }, () => ({
        need: 15 + Math.floor(random() * 40) * 15,
        deadlineIndex: Math.floor(random() * segments),
      }));
      const targets = fairTargets(tasks, capacity);
      let used = 0;
      capacity.forEach((cap, k) => {
        used = sum(
          targets.filter(
            (_, index) => (tasks[index] as { deadlineIndex: number }).deadlineIndex <= k,
          ),
        );
        expect(used).toBeLessThanOrEqual(
          capacity.slice(0, k + 1).reduce((a, b) => a + b, 0) + 1e-6,
        );
      });
      targets.forEach((target, index) => {
        expect(target).toBeGreaterThanOrEqual(0);
        expect(target).toBeLessThanOrEqual((tasks[index] as { need: number }).need + 1e-6);
      });
    }
  });
});
