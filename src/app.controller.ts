import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return { name: 'presensi-siswa-api', version: '0.1.0' };
  }
}
