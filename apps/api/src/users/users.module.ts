import { Global, Module } from '@nestjs/common';
import { DemoLimitsService } from './demo-limits.service';
import { UsersRepository } from './users.repository';

@Global()
@Module({
  providers: [UsersRepository, DemoLimitsService],
  exports: [UsersRepository, DemoLimitsService],
})
export class UsersModule {}
