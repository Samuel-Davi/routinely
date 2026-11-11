import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  fixedCommitmentInputSchema,
  fixedCommitmentSchema,
  type FixedCommitment,
  type FixedCommitmentInput,
} from '@routinely/shared';
import { z } from 'zod';
import { IdPipe } from '../common/id.pipe';
import { ApiIdParam, ApiZodBody, ApiZodResponse } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FixedCommitmentsService } from './fixed-commitments.service';

const bodyPipe = new ZodValidationPipe(fixedCommitmentInputSchema);

@ApiTags('fixed-commitments')
@Controller('fixed-commitments')
export class FixedCommitmentsController {
  constructor(private readonly service: FixedCommitmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os compromissos fixos semanais' })
  @ApiZodResponse(z.array(fixedCommitmentSchema))
  list(): Promise<FixedCommitment[]> {
    return this.service.list();
  }

  @Get(':id')
  @ApiIdParam()
  @ApiZodResponse(fixedCommitmentSchema)
  get(@Param('id', IdPipe) id: string): Promise<FixedCommitment> {
    return this.service.get(id);
  }

  @Post()
  @ApiZodBody(fixedCommitmentInputSchema)
  @ApiZodResponse(fixedCommitmentSchema, 201)
  create(@Body(bodyPipe) body: FixedCommitmentInput): Promise<FixedCommitment> {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiIdParam()
  @ApiZodBody(fixedCommitmentInputSchema)
  @ApiZodResponse(fixedCommitmentSchema)
  update(
    @Param('id', IdPipe) id: string,
    @Body(bodyPipe) body: FixedCommitmentInput,
  ): Promise<FixedCommitment> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiIdParam()
  @ApiNoContentResponse()
  remove(@Param('id', IdPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
