import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { preferencesSchema, type Preferences } from '@routinely/shared';
import { ApiZodBody, ApiZodResponse } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PreferencesService } from './preferences.service';

@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly service: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Preferências de rotina do usuário' })
  @ApiZodResponse(preferencesSchema)
  get(): Promise<Preferences> {
    return this.service.get();
  }

  @Put()
  @ApiZodBody(preferencesSchema)
  @ApiZodResponse(preferencesSchema)
  update(@Body(new ZodValidationPipe(preferencesSchema)) body: Preferences): Promise<Preferences> {
    return this.service.update(body);
  }
}
