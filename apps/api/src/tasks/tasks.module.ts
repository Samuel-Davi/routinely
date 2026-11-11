import { Module } from '@nestjs/common';
import { PreferencesModule } from '../preferences/preferences.module';
import { ESTIMATION_QUEUE } from './estimation-queue';
import { TaskEstimationWorker } from './task-estimation.worker';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

@Module({
  imports: [PreferencesModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksRepository,
    TaskEstimationWorker,
    { provide: ESTIMATION_QUEUE, useExisting: TaskEstimationWorker },
  ],
  exports: [TasksService, TasksRepository, TaskEstimationWorker],
})
export class TasksModule {}
