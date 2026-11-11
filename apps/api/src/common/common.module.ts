import { Global, Module } from '@nestjs/common';
import { CurrentUser } from './current-user';

@Global()
@Module({ providers: [CurrentUser], exports: [CurrentUser] })
export class CommonModule {}
