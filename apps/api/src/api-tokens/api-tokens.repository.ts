import { Injectable } from '@nestjs/common';
import type { ApiToken as ApiTokenRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NewApiToken {
  label: string;
  prefix: string;
  tokenHash: string;
  scopes: string[];
}

@Injectable()
export class ApiTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: NewApiToken): Promise<ApiTokenRow> {
    return this.prisma.apiToken.create({ data: { ...data, userId } });
  }

  list(userId: string): Promise<ApiTokenRow[]> {
    return this.prisma.apiToken.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  findByHash(tokenHash: string): Promise<ApiTokenRow | null> {
    return this.prisma.apiToken.findUnique({ where: { tokenHash } });
  }

  /** Revokes (idempotent: an already revoked token keeps its first `revokedAt`). */
  async revoke(userId: string, id: string): Promise<boolean> {
    const token = await this.prisma.apiToken.findFirst({ where: { id, userId } });
    if (!token) return false;
    if (!token.revokedAt) {
      await this.prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    }
    return true;
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.prisma.apiToken.update({ where: { id }, data: { lastUsedAt: at } });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  findUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { isDemo: true } });
  }
}
