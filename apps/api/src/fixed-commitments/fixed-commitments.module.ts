import { Module } from '@nestjs/common';
import { FixedCommitmentsController } from './fixed-commitments.controller';
import { FixedCommitmentsRepository } from './fixed-commitments.repository';
import { FixedCommitmentsService } from './fixed-commitments.service';

@Module({
  controllers: [FixedCommitmentsController],
  providers: [FixedCommitmentsService, FixedCommitmentsRepository],
  exports: [FixedCommitmentsRepository],
})
export class FixedCommitmentsModule {}
