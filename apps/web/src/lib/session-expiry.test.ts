import { REDIRECT_GUARD_KEY, leaveForLogin } from './session-expiry';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('leaveForLogin', () => {
  it('clears the cookies on the server first, then goes to /login', async () => {
    const order: string[] = [];
    const went = await leaveForLogin({
      logout: async () => void order.push('logout'),
      navigate: (path) => void order.push(`navigate:${path}`),
      now: () => 100_000,
      storage: memory(),
      pathname: '/tarefas',
    });
    expect(went).toBe(true);
    expect(order).toEqual(['logout', 'navigate:/login']);
  });

  it('does nothing on the login screen itself', async () => {
    const navigate = vi.fn();
    const logout = vi.fn();
    expect(
      await leaveForLogin({
        logout,
        navigate,
        now: () => 1,
        storage: memory(),
        pathname: '/login',
      }),
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });

  it('refuses to redirect twice within the guard window (breaks a redirect loop)', async () => {
    const storage = memory();
    const navigate = vi.fn();
    const deps = { logout: async () => undefined, navigate, storage, pathname: '/' };
    expect(await leaveForLogin({ ...deps, now: () => 100_000 })).toBe(true);
    expect(await leaveForLogin({ ...deps, now: () => 103_000 })).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    // after the window it is allowed again
    expect(await leaveForLogin({ ...deps, now: () => 120_000 })).toBe(true);
    expect(storage.getItem(REDIRECT_GUARD_KEY)).toBe('120000');
  });

  it('still leaves when the server logout fails or storage is unavailable', async () => {
    const navigate = vi.fn();
    const went = await leaveForLogin({
      logout: async () => {
        throw new Error('network');
      },
      navigate,
      now: () => 1,
      storage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      },
      pathname: '/',
    });
    expect(went).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
