import { Module } from '@nestjs/common';
import { RoutinesModule } from '../routines/routines.module';
import { DemoService } from './demo.service';

@Module({ imports: [RoutinesModule], providers: [DemoService] })
export class DemoModule {}
