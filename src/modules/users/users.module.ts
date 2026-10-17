import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetController } from './password-reset.controller';

@Module({
  controllers: [UsersController, PasswordResetController],
  providers: [UsersService, PasswordResetService],
  exports: [UsersService, PasswordResetService],
})
export class UsersModule {}
