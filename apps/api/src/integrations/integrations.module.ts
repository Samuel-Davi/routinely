import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { PreferencesModule } from '../preferences/preferences.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [ApiTokensModule, PreferencesModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationsRepository],
})
export class IntegrationsModule {}
