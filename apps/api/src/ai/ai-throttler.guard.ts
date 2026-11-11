import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Simple rate limit for endpoints that trigger LLM calls. Applied per route with
 * `@UseGuards(AiThrottlerGuard)`; limits come from `AI_RATE_LIMIT_*`.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {}
