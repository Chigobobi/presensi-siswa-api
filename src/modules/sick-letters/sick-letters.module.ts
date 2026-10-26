import { Module } from '@nestjs/common';
import { SickLettersController } from './sick-letters.controller';
import { SickLettersService } from './sick-letters.service';
import { LocalStorageService } from './storage/local-storage.service';

@Module({
  controllers: [SickLettersController],
  providers: [SickLettersService, LocalStorageService],
  exports: [SickLettersService],
})
export class SickLettersModule {}
