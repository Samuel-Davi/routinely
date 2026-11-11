import { Injectable } from '@nestjs/common';
import type { FixedCommitment as FixedCommitmentRow } from '@prisma/client';
import {
  findCommitmentOverlaps,
  type FixedCommitment,
  type FixedCommitmentInput,
} from '@routinely/shared';
import { AppError } from '../common/app-error';
import { CurrentUser } from '../common/current-user';
import { DemoLimitsService } from '../users/demo-limits.service';
import { UsersRepository } from '../users/users.repository';
import { FixedCommitmentsRepository } from './fixed-commitments.repository';

/**
 * Maps a row to its DTO. `all` is the user's full list, used to tell which other
 * commitments share time with this one (a warning, never an error).
 */
export function toFixedCommitmentDto(
  row: FixedCommitmentRow,
  all: readonly FixedCommitmentRow[] = [],
): FixedCommitment {
  const overlapsWith = findCommitmentOverlaps(all)
    .filter((overlap) => overlap.a === row.id || overlap.b === row.id)
    .map((overlap) => {
      const otherId = overlap.a === row.id ? overlap.b : overlap.a;
      const other = all.find((item) => item.id === otherId) as FixedCommitmentRow;
      return { id: other.id, title: other.title, daysOfWeek: overlap.daysOfWeek };
    });
  return {
    id: row.id,
    title: row.title,
    daysOfWeek: [...row.daysOfWeek].sort((a, b) => a - b),
    startTime: row.startTime,
    endTime: row.endTime,
    category: row.category,
    color: row.color as FixedCommitment['color'],
    requiresTravel: row.requiresTravel,
    overlapsWith,
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
    private readonly demoLimits: DemoLimitsService,
  ) {}

  async list(): Promise<FixedCommitment[]> {
    const rows = await this.repository.findAll(this.currentUser.id);
    return rows.map((row) => toFixedCommitmentDto(row, rows));
  }

  async get(id: string): Promise<FixedCommitment> {
    return this.withOverlaps(await this.findOrThrow(id));
  }

  async create(input: FixedCommitmentInput): Promise<FixedCommitment> {
    await this.demoLimits.assertCanCreate(this.currentUser.id, 'commitment');
    const row = await this.repository.create(this.currentUser.id, input);
    await this.users.touchSchedule(this.currentUser.id);
    return this.withOverlaps(row);
  }

  async update(id: string, input: FixedCommitmentInput): Promise<FixedCommitment> {
    await this.findOrThrow(id);
    const row = await this.repository.update(id, input);
    await this.users.touchSchedule(this.currentUser.id);
    return this.withOverlaps(row);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.repository.delete(id);
    await this.users.touchSchedule(this.currentUser.id);
  }

  private async withOverlaps(row: FixedCommitmentRow): Promise<FixedCommitment> {
    return toFixedCommitmentDto(row, await this.repository.findAll(this.currentUser.id));
  }

  private async findOrThrow(id: string): Promise<FixedCommitmentRow> {
    const row = await this.repository.findById(this.currentUser.id, id);
    if (!row) throw AppError.notFound('Compromisso');
    return row;
  }
}
