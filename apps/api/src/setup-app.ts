import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { APP_CONFIG, type AppConfig } from './config/config.module';

/** Cross-cutting setup shared by `main.ts` and the e2e tests. */
export function setupApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useGlobalFilters(new AllExceptionsFilter());
  // Client IP for the auth rate limit: only trust X-Forwarded-For from this many proxies.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    // An explicit allow-list (never "*"): cookies are only sent to these origins.
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Routinely API')
      .setDescription('Rotina semanal gerada com IA a partir de compromissos fixos e tarefas.')
      .setVersion('0.1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
