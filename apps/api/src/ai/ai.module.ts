import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { AiThrottlerGuard } from './ai-throttler.guard';
import { AiController } from './ai.controller';
import { TaskEstimator } from './estimate-task';
import { RoutineProposer } from './generate-routine';
import { LLM_TIMING, LlmClient, defaultTiming } from './llm-client';
import { LLM_PROVIDER } from './llm-provider';
import { createLlmProvider } from './providers/create-provider';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.AI_RATE_LIMIT_TTL_MS, limit: config.AI_RATE_LIMIT_MAX }],
      }),
    }),
  ],
  controllers: [AiController],
  providers: [
    { provide: LLM_PROVIDER, inject: [APP_CONFIG], useFactory: createLlmProvider },
    { provide: LLM_TIMING, useValue: defaultTiming },
    LlmClient,
    TaskEstimator,
    RoutineProposer,
    AiThrottlerGuard,
  ],
  exports: [
    LlmClient,
    TaskEstimator,
    RoutineProposer,
    AiThrottlerGuard,
    ThrottlerModule,
    LLM_PROVIDER,
  ],
})
export class AiModule {}
