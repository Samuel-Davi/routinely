import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LlmClient } from './llm-client';

export interface AiStatus {
  provider: string;
  /** False when no API key is set: the app then plans with the heuristic only. */
  configured: boolean;
  model: string;
  retryModel: string;
  /** Problems found when checking the configured models at boot (empty when fine). */
  modelWarnings: string[];
}

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly llm: LlmClient) {}

  @Get('status')
  @ApiOperation({ summary: 'Provedor de IA ativo e se está configurado (nunca expõe a chave)' })
  @ApiOkResponse()
  status(): AiStatus {
    return {
      provider: this.llm.providerName,
      configured: this.llm.isConfigured(),
      model: this.llm.modelFor('default'),
      retryModel: this.llm.modelFor('retry'),
      modelWarnings: this.llm.modelReport.warnings,
    };
  }
}
