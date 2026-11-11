import { Module } from '@nestjs/common';
import { ESTIMATION_QUEUE, NoopEstimationQueue } from './estimation-queue';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksRepository,
    { provide: ESTIMATION_QUEUE, useClass: NoopEstimationQueue },
  ],
  exports: [TasksService, TasksRepository],
})
export class TasksModule {}
