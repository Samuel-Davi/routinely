import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  apiTokenSchema,
  createApiTokenSchema,
  createdApiTokenSchema,
  type ApiToken,
  type CreateApiTokenInput,
  type CreatedApiToken,
} from '@routinely/shared';
import { z } from 'zod';
import { CurrentUser } from '../common/current-user';
import { IdPipe } from '../common/id.pipe';
import { ApiIdParam, ApiZodBody, ApiZodResponse } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiTokensService } from './api-tokens.service';

/** Managing personal tokens requires the normal session (global `JwtAuthGuard`). */
@ApiTags('api-tokens')
@Controller('api-tokens')
export class ApiTokensController {
  constructor(
    private readonly service: ApiTokensService,
    private readonly currentUser: CurrentUser,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cria um token pessoal só de leitura (o token aparece só aqui)' })
  @ApiZodBody(createApiTokenSchema)
  @ApiZodResponse(createdApiTokenSchema, 201)
  create(
    @Body(new ZodValidationPipe(createApiTokenSchema)) body: CreateApiTokenInput,
  ): Promise<CreatedApiToken> {
    return this.service.create(this.currentUser.id, body.label);
  }

  @Get()
  @ApiOperation({ summary: 'Lista os tokens pessoais (sem o token)' })
  @ApiZodResponse(z.array(apiTokenSchema))
  list(): Promise<ApiToken[]> {
    return this.service.list(this.currentUser.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiIdParam()
  @ApiNoContentResponse()
  revoke(@Param('id', IdPipe) id: string): Promise<void> {
    return this.service.revoke(this.currentUser.id, id);
  }
}
