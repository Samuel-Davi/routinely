import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  activeRoutineSchema,
  completeBlockSchema,
  generateRoutineInputSchema,
  lockBlockSchema,
  moveBlockSchema,
  replanSuggestionSchema,
  routineBlockSchema,
  routineSchema,
  routineSummarySchema,
  type ActiveRoutine,
  type CompleteBlockInput,
  type GenerateRoutineInput,
  type LockBlockInput,
  type MoveBlockInput,
  type ReplanSuggestion,
  type Routine,
  type RoutineBlock,
  type RoutineSummary,
} from '@routinely/shared';
import { z } from 'zod';
import { AiThrottlerGuard } from '../ai/ai-throttler.guard';
import { IdPipe } from '../common/id.pipe';
import { ApiIdParam, ApiZodBody, ApiZodResponse } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RoutinesService } from './routines.service';

@ApiTags('routines')
@Controller('routines')
export class RoutinesController {
  constructor(private readonly service: RoutinesService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico de versões geradas (mais recente primeiro)' })
  @ApiZodResponse(z.array(routineSummarySchema))
  history(): Promise<RoutineSummary[]> {
    return this.service.history();
  }

  @Get('active')
  @ApiOperation({ summary: 'Rotina ativa com seus blocos, ou null se ainda não há rotina' })
  @ApiZodResponse(activeRoutineSchema)
  async active(): Promise<ActiveRoutine> {
    return { routine: await this.service.getActive() };
  }

  @Get('replan-suggestion')
  @ApiOperation({ summary: 'Indica se a rotina ativa ficou desatualizada e por quê' })
  @ApiZodResponse(replanSuggestionSchema)
  replanSuggestion(): Promise<ReplanSuggestion> {
    return this.service.replanSuggestion();
  }

  @Post('generate')
  @HttpCode(202)
  @UseGuards(AiThrottlerGuard)
  @ApiOperation({
    summary: 'Gera a rotina da semana em segundo plano (acompanhe por GET /routines/:id)',
  })
  @ApiZodBody(generateRoutineInputSchema)
  @ApiZodResponse(routineSummarySchema, 202)
  generate(
    @Body(new ZodValidationPipe(generateRoutineInputSchema)) body: GenerateRoutineInput,
  ): Promise<RoutineSummary> {
    return this.service.generate(body);
  }

  @Post('replan')
  @HttpCode(202)
  @UseGuards(AiThrottlerGuard)
  @ApiOperation({ summary: 'Regenera apenas o futuro, preservando blocos travados e concluídos' })
  @ApiZodResponse(routineSummarySchema, 202)
  replan(): Promise<RoutineSummary> {
    return this.service.replan();
  }

  @Patch('blocks/:blockId')
  @ApiOperation({ summary: 'Move/redimensiona um bloco (fica travado). 409 em caso de conflito' })
  @ApiIdParam('blockId')
  @ApiZodBody(moveBlockSchema)
  @ApiZodResponse(routineBlockSchema)
  moveBlock(
    @Param('blockId', IdPipe) blockId: string,
    @Body(new ZodValidationPipe(moveBlockSchema)) body: MoveBlockInput,
  ): Promise<RoutineBlock> {
    return this.service.moveBlock(blockId, body);
  }

  @Patch('blocks/:blockId/lock')
  @ApiOperation({ summary: 'Trava ou destrava um bloco' })
  @ApiIdParam('blockId')
  @ApiZodBody(lockBlockSchema)
  @ApiZodResponse(routineBlockSchema)
  setLocked(
    @Param('blockId', IdPipe) blockId: string,
    @Body(new ZodValidationPipe(lockBlockSchema)) body: LockBlockInput,
  ): Promise<RoutineBlock> {
    return this.service.setLocked(blockId, body.locked);
  }

  @Patch('blocks/:blockId/complete')
  @ApiOperation({ summary: 'Conclui ou reabre um bloco; a tarefa é concluída junto com o último' })
  @ApiIdParam('blockId')
  @ApiZodBody(completeBlockSchema)
  @ApiZodResponse(routineBlockSchema)
  completeBlock(
    @Param('blockId', IdPipe) blockId: string,
    @Body(new ZodValidationPipe(completeBlockSchema)) body: CompleteBlockInput,
  ): Promise<RoutineBlock> {
    return this.service.completeBlock(blockId, body.completed);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Uma versão da rotina (use para acompanhar o status da geração)' })
  @ApiIdParam()
  @ApiZodResponse(routineSchema)
  get(@Param('id', IdPipe) id: string): Promise<Routine> {
    return this.service.get(id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restaura uma versão antiga como uma nova versão ativa' })
  @ApiIdParam()
  @ApiZodResponse(routineSchema, 201)
  restore(@Param('id', IdPipe) id: string): Promise<Routine> {
    return this.service.restore(id);
  }
}
