import { Module } from '@nestjs/common';
import { FixedCommitmentsModule } from '../fixed-commitments/fixed-commitments.module';
import { PreferencesModule } from '../preferences/preferences.module';
import { TasksModule } from '../tasks/tasks.module';
import { RoutinesController } from './routines.controller';
import { RoutinesRepository } from './routines.repository';
import { RoutinesService } from './routines.service';

@Module({
  imports: [TasksModule, FixedCommitmentsModule, PreferencesModule],
  controllers: [RoutinesController],
  providers: [RoutinesService, RoutinesRepository],
})
export class RoutinesModule {}
