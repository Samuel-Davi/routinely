import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows up to the max inside the window, per key, and recovers afterwards', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
    now = 1001;
    expect(limiter.allow('a')).toBe(true);
  });

  it('can be reset for a key', () => {
    const limiter = new RateLimiter(1, 1000, () => 0);
    limiter.allow('a');
    expect(limiter.allow('a')).toBe(false);
    limiter.reset('a');
    expect(limiter.allow('a')).toBe(true);
  });
});
