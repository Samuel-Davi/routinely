// @vitest-environment node
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

const request = (path: string, cookies = '') =>
  new NextRequest(`https://web.test${path}`, { headers: cookies ? { cookie: cookies } : {} });

const location = (response: Response) => response.headers.get('location');

describe('page guard (proxy.ts)', () => {
  it('sends visitors without a session to /login, remembering where they were going', () => {
    expect(location(proxy(request('/tarefas')))).toBe('https://web.test/login?next=%2Ftarefas');
    expect(location(proxy(request('/tarefas?status=open')))).toContain(
      'next=%2Ftarefas%3Fstatus%3Dopen',
    );
    // the home page needs no ?next=
    expect(location(proxy(request('/')))).toBe('https://web.test/login');
  });

  it('lets signed-in users through, and bounces them away from the login screens', () => {
    expect(proxy(request('/tarefas', 'routinely_at=x')).headers.get('location')).toBeNull();
    expect(location(proxy(request('/login', 'routinely_rt=y')))).toBe('https://web.test/');
    expect(location(proxy(request('/cadastro', 'routinely_at=x')))).toBe('https://web.test/');
  });

  it('keeps login and signup reachable without a session', () => {
    expect(proxy(request('/login')).headers.get('location')).toBeNull();
    expect(proxy(request('/cadastro')).headers.get('location')).toBeNull();
  });

  it('is not applied to the API proxy, Next internals or static files', () => {
    const pattern = new RegExp(`^${(config.matcher[0] as string).replace(/\\\\/g, '\\')}$`);
    for (const path of [
      '/api/auth/me',
      '/_next/static/chunk.js',
      '/_next/image',
      '/favicon.ico',
      '/logo.png',
    ]) {
      expect(pattern.test(path)).toBe(false);
    }
    for (const path of ['/', '/tarefas', '/login']) expect(pattern.test(path)).toBe(true);
  });
});
