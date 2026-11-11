import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { CommonModule } from './common/common.module';
import { APP_CONFIG, ConfigModule, type AppConfig } from './config/config.module';
import { FixedCommitmentsModule } from './fixed-commitments/fixed-commitments.module';
import { HealthModule } from './health/health.module';
import { PreferencesModule } from './preferences/preferences.module';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.LOG_LEVEL,
          // Structured JSON in production; readable output in development.
          transport:
            config.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-goog-api-key"]',
              'req.headers["x-api-key"]',
              '*.apiKey',
              '*.GEMINI_API_KEY',
              '*.ANTHROPIC_API_KEY',
            ],
            censor: '[redacted]',
          },
          autoLogging: { ignore: (req) => req.url === '/health' },
        },
      }),
    }),
    PrismaModule,
    CommonModule,
    UsersModule,
    AiModule,
    HealthModule,
    FixedCommitmentsModule,
    TasksModule,
    PreferencesModule,
  ],
})
export class AppModule {}
