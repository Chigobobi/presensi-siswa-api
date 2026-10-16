import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const nodeEnv = config.get<string>('app.nodeEnv', 'development');
  const corsOrigins = config.get<string[]>('app.corsOrigins', []);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
    }),
  );

  // Cookie parser (untuk session cookie)
  app.use(cookieParser());

  // CORS — whitelist origin frontend
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'api/docs', 'api/docs-json'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger — hanya di non-production
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Sistem Presensi Siswa API')
      .setDescription('Backend API untuk Sistem Presensi Siswa — SMK Negeri 11 Jakarta')
      .setVersion('0.1.0')
      .addCookieAuth('session')
      .addTag('Auth', 'Autentikasi & sesi')
      .addTag('Users', 'Kelola akun pengguna')
      .addTag('Students', 'Kelola data siswa')
      .addTag('Teachers', 'Kelola data guru')
      .addTag('Classes', 'Kelola kelas & Ketua Kelas')
      .addTag('Attendance', 'Presensi siswa')
      .addTag('Schedules', 'Jadwal sesi presensi')
      .addTag('Monitoring', 'Monitoring kelas')
      .addTag('Reports', 'Laporan & rekap')
      .addTag('Audit', 'Log aktivitas')
      .addTag('Health', 'Health check')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
    logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Environment: ${nodeEnv}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
