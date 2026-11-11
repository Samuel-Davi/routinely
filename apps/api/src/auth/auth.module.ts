import { Global, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { AuthContextMiddleware } from './auth-context.middleware';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegistrationEnabledGuard } from './registration-enabled.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_SECRET,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    RegistrationEnabledGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthContextMiddleware).forRoutes('*');
  }
}
