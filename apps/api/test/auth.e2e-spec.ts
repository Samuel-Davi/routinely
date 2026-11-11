import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { APP_CONFIG } from '../src/config/config.module';
import { loadEnv } from '../src/config/env';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './test-app';

const credentials = { email: 'ana@example.com', password: 'cavalo-azul-42' };

/** The `name=value` pairs of the Set-Cookie headers, to replay them as a Cookie header. */
function cookiesOf(response: request.Response): Record<string, string> {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries(
    (header ?? []).map((line) => {
      const [pair = ''] = line.split(';');
      const index = pair.indexOf('=');
      return [pair.slice(0, index), pair.slice(index + 1)];
    }),
  );
}
const cookieHeader = (jar: Record<string, string>) =>
  Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(APP_CONFIG)
        .useValue({ ...loadEnv(), AUTH_RATE_LIMIT_MAX: 1000, COOKIE_SECURE: true }),
    ));
  });
  beforeEach(() => resetDatabase(prisma));
  afterAll(() => app.close());

  async function signup(email = credentials.email) {
    const response = await http()
      .post('/auth/register')
      .send({ ...credentials, email })
      .expect(201);
    return { response, jar: cookiesOf(response) };
  }

  it('requires a session on every route except the public ones', async () => {
    for (const path of [
      '/tasks',
      '/fixed-commitments',
      '/preferences',
      '/routines/active',
      '/auth/me',
      '/ai/status',
    ]) {
      const response = await http().get(path).expect(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
    await http().get('/health').expect(200);
    await http().post('/tasks').send({}).expect(401);
  });

  it('registers, sets httpOnly Secure SameSite=Lax cookies and never returns the hash', async () => {
    const { response, jar } = await signup();
    expect(response.body).toMatchObject({ email: 'ana@example.com', name: 'ana' });
    expect(JSON.stringify(response.body)).not.toMatch(/hash|password/i);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    }
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain(credentials.password);

    const me = await http().get('/auth/me').set('Cookie', cookieHeader(jar)).expect(200);
    expect(me.body.email).toBe('ana@example.com');
  });

  it('rejects weak passwords and bad e-mails with field errors, and a duplicate generically', async () => {
    const weak = await http()
      .post('/auth/register')
      .send({ email: 'a@b.co', password: 'curta' })
      .expect(400);
    expect(JSON.stringify(weak.body)).toContain('password');
    await http()
      .post('/auth/register')
      .send({ email: 'x', password: credentials.password })
      .expect(400);

    await signup();
    const duplicate = await http().post('/auth/register').send(credentials).expect(409);
    expect(duplicate.body.code).toBe('REGISTRATION_FAILED');
    expect(duplicate.body.message).not.toMatch(/existe|já|cadastrad/i);
  });

  it('logs in, and answers wrong password and unknown e-mail identically', async () => {
    await signup();
    const ok = await http().post('/auth/login').send(credentials).expect(200);
    expect(Object.keys(cookiesOf(ok))).toHaveLength(2);

    const wrongPassword = await http()
      .post('/auth/login')
      .send({ ...credentials, password: 'outra-senha-99' })
      .expect(401);
    const unknownEmail = await http()
      .post('/auth/login')
      .send({ email: 'ninguem@example.com', password: 'outra-senha-99' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.message).toBe('E-mail ou senha incorretos.');
  });

  it('refuses the seed user until an owner password is set, and tokens with another signature', async () => {
    await http()
      .post('/auth/login')
      .send({ email: 'seed@example.com', password: 'qualquer-coisa-1' })
      .expect(401);
    await http().get('/tasks').set('Authorization', 'Bearer not.a.token').expect(401);
  });

  it('rotates the refresh token and revokes the whole family when an old one is replayed', async () => {
    const { jar } = await signup();
    const first = jar['routinely_rt'] as string;

    const rotated = await http().post('/auth/refresh').set('Cookie', cookieHeader(jar)).expect(200);
    const second = cookiesOf(rotated)['routinely_rt'] as string;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    // The old token is now "used": replaying it is treated as theft.
    await http().post('/auth/refresh').set('Cookie', `routinely_rt=${first}`).expect(401);
    // ...which also kills the new token of the same login.
    await http().post('/auth/refresh').set('Cookie', `routinely_rt=${second}`).expect(401);
    await http().post('/auth/refresh').expect(401);
  });

  it('logs out: the refresh token stops working and the cookies are cleared', async () => {
    const { jar } = await signup();
    const out = await http().post('/auth/logout').set('Cookie', cookieHeader(jar)).expect(204);
    expect((out.headers['set-cookie'] as unknown as string[]).join(' ')).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
    await http().post('/auth/refresh').set('Cookie', cookieHeader(jar)).expect(401);
    // logging out twice, or without a session, is harmless
    await http().post('/auth/logout').expect(204);
  });

  it('sets security headers and a credentialed CORS allow-list', async () => {
    const response = await http().get('/health').set('Origin', 'http://localhost:3000').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const stranger = await http().get('/health').set('Origin', 'https://evil.example').expect(200);
    expect(stranger.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Authentication rate limit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder.overrideProvider(APP_CONFIG).useValue({ ...loadEnv(), AUTH_RATE_LIMIT_MAX: 4 }),
    ));
    await resetDatabase(prisma);
  });
  afterAll(() => app.close());

  it('limits attempts per e-mail with a generic 429, and per IP at twice that', async () => {
    await http()
      .post('/auth/register')
      .send({ email: 'limite@example.com', password: 'cavalo-azul-42' })
      .expect(201);
    const attempt = (email: string) =>
      http().post('/auth/login').send({ email, password: 'errada-123456' });
    // 1 signup + 3 failed logins = the 4 attempts allowed for this e-mail
    for (let index = 0; index < 3; index += 1) await attempt('limite@example.com').expect(401);
    const blocked = await attempt('limite@example.com').expect(429);
    expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(blocked.body.message).not.toMatch(/e-mail|conta/i);

    // Another e-mail from the same IP still has budget (8 per IP, 5 already used) ...
    for (let index = 0; index < 3; index += 1)
      await attempt(`outro${index}@example.com`).expect(401);
    // ... until the IP itself is over the limit.
    await attempt('mais-um@example.com').expect(429);
  });
});
