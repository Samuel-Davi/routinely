import { Injectable } from '@nestjs/common';

/** Source of the current time; overridden in tests to make planning deterministic. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
