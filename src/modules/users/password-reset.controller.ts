import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PasswordResetService } from './password-reset.service';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';

@ApiTags('Auth')
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Konfirmasi reset password dengan token (publik)',
  })
  async confirm(@Body() dto: ConfirmPasswordResetDto): Promise<void> {
    await this.passwordResetService.confirmReset(dto.token, dto.newPassword);
  }
}
