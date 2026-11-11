import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module';
import { APP_CONFIG, ConfigModule, type AppConfig } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

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
    HealthModule,
  ],
})
export class AppModule {}
