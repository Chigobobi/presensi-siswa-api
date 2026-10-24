import { IsString, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
