import { Logger } from '@nestjs/common';

// Keep test output readable: application logs are not part of the assertions.
Logger.overrideLogger(false);
