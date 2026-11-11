import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  TASK_STATUSES,
  createTaskSchema,
  taskSchema,
  taskStatusSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type Task,
  type UpdateTaskInput,
} from '@routinely/shared';
import { z } from 'zod';
import { AiThrottlerGuard } from '../ai/ai-throttler.guard';
import { IdPipe } from '../common/id.pipe';
import { ApiIdParam, ApiZodBody, ApiZodResponse } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TasksService } from './tasks.service';

const listQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  commitmentId: z.string().uuid().optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as tarefas, ordenadas por deadline' })
  @ApiQuery({ name: 'status', required: false, enum: TASK_STATUSES })
  @ApiQuery({ name: 'commitmentId', required: false })
  @ApiZodResponse(z.array(taskSchema))
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery): Promise<Task[]> {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiIdParam()
  @ApiZodResponse(taskSchema)
  get(@Param('id', IdPipe) id: string): Promise<Task> {
    return this.service.get(id);
  }

  @Post()
  @UseGuards(AiThrottlerGuard)
  @ApiOperation({ summary: 'Cria a tarefa; a estimativa de IA roda em segundo plano' })
  @ApiZodBody(createTaskSchema)
  @ApiZodResponse(taskSchema, 201)
  create(@Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskInput): Promise<Task> {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza campos, status ou sobrescreve a estimativa manualmente' })
  @ApiIdParam()
  @ApiZodBody(updateTaskSchema)
  @ApiZodResponse(taskSchema)
  update(
    @Param('id', IdPipe) id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput,
  ): Promise<Task> {
    return this.service.update(id, body);
  }

  @Post(':id/estimate')
  @UseGuards(AiThrottlerGuard)
  @HttpCode(202)
  @ApiOperation({ summary: 'Descarta o override manual e pede uma nova estimativa à IA' })
  @ApiIdParam()
  @ApiZodResponse(taskSchema, 202)
  reestimate(@Param('id', IdPipe) id: string): Promise<Task> {
    return this.service.reestimate(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiIdParam()
  @ApiNoContentResponse()
  remove(@Param('id', IdPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
