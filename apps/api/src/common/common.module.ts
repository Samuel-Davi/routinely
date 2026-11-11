import { Global, Module } from '@nestjs/common';
import { Clock } from './clock';
import { CurrentUser } from './current-user';

@Global()
@Module({ providers: [CurrentUser, Clock], exports: [CurrentUser, Clock] })
export class CommonModule {}
