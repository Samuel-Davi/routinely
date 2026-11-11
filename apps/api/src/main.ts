import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/config.module';
import { setupApp } from './setup-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  setupApp(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT, '0.0.0.0');
  app.get(Logger).log(`Routinely API listening on port ${config.PORT} (docs at /docs)`);
}

void bootstrap();
