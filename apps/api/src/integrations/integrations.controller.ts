import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { todayQuerySchema, todaySchema, type Today, type TodayQuery } from '@routinely/shared';
import { ApiTokenAuth } from '../api-tokens/api-token.guard';
import { ApiZodResponse } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { IntegrationsService } from './integrations.service';

/** Read-only routes for external assistants. Personal token only, never the session cookie. */
@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get('today')
  @ApiTokenAuth('read:today')
  @ApiOperation({ summary: 'Rotina, compromissos e prazos de um dia (token pessoal read:today)' })
  @ApiQuery({ name: 'date', required: false, description: 'AAAA-MM-DD; padrão: hoje no fuso' })
  @ApiZodResponse(todaySchema)
  today(@Query(new ZodValidationPipe(todayQuerySchema)) query: TodayQuery): Promise<Today> {
    return this.service.today(query.date);
  }
}
