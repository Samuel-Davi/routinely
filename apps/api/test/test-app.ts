import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SEED_USER_ID } from '../src/config/env';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

/** Boots the real application against the e2e database. */
export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<TestApp> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Empties every table and recreates the single seed user. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "RoutineBlock", "Routine", "EstimateCache", "Task", "FixedCommitment", "Preferences", "AiGlobalUsage", "User" CASCADE',
  );
  await prisma.user.create({ data: { id: SEED_USER_ID, name: 'Test user' } });
}

/** A signed access token for `userId`, as the login endpoint would issue. */
export function accessTokenFor(app: INestApplication, userId: string): string {
  return app.get(JwtService).sign({ sub: userId, typ: 'access' }, { expiresIn: 900 });
}

export type HttpFn = () => ReturnType<typeof request.agent>;

/** `http()` that sends requests as `userId` (default: the seed user created by `resetDatabase`). */
export function asUser(app: INestApplication, userId: string = SEED_USER_ID): HttpFn {
  const token = accessTokenFor(app, userId);
  return () => request.agent(app.getHttpServer()).set('Authorization', `Bearer ${token}`);
}
