import { Injectable } from '@nestjs/common';
import type { FixedCommitment as FixedCommitmentRow } from '@prisma/client';
import type { FixedCommitment, FixedCommitmentInput } from '@routinely/shared';
import { AppError } from '../common/app-error';
import { CurrentUser } from '../common/current-user';
import { UsersRepository } from '../users/users.repository';
import { FixedCommitmentsRepository } from './fixed-commitments.repository';

export function toFixedCommitmentDto(row: FixedCommitmentRow): FixedCommitment {
  return {
    id: row.id,
    title: row.title,
    daysOfWeek: [...row.daysOfWeek].sort((a, b) => a - b),
    startTime: row.startTime,
    endTime: row.endTime,
    category: row.category,
    color: row.color as FixedCommitment['color'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class FixedCommitmentsService {
  constructor(
    private readonly repository: FixedCommitmentsRepository,
    private readonly users: UsersRepository,
    private readonly currentUser: CurrentUser,
  ) {}

  async list(): Promise<FixedCommitment[]> {
    const rows = await this.repository.findAll(this.currentUser.id);
    return rows.map(toFixedCommitmentDto);
  }

  async get(id: string): Promise<FixedCommitment> {
    return toFixedCommitmentDto(await this.findOrThrow(id));
  }

  async create(input: FixedCommitmentInput): Promise<FixedCommitment> {
    const row = await this.repository.create(this.currentUser.id, input);
    await this.users.touchSchedule(this.currentUser.id);
    return toFixedCommitmentDto(row);
  }

  async update(id: string, input: FixedCommitmentInput): Promise<FixedCommitment> {
    await this.findOrThrow(id);
    const row = await this.repository.update(id, input);
    await this.users.touchSchedule(this.currentUser.id);
    return toFixedCommitmentDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.repository.delete(id);
    await this.users.touchSchedule(this.currentUser.id);
  }

  private async findOrThrow(id: string): Promise<FixedCommitmentRow> {
    const row = await this.repository.findById(this.currentUser.id, id);
    if (!row) throw AppError.notFound('Compromisso');
    return row;
  }
}
