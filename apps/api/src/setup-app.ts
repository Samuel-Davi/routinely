import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { APP_CONFIG, type AppConfig } from './config/config.module';

/** Cross-cutting setup shared by `main.ts` and the e2e tests. */
export function setupApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.CORS_ORIGINS,
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
