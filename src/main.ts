import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform/transform.interceptor';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Security
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: [process.env.FRONTEND_URL, 'http://localhost:3000', 'https://backing-production.up.railway.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('NexaBank API')
    .setDescription('Professional USA Banking System — Full API Documentation')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .addTag('Auth', 'Authentication & Security')
    .addTag('Users', 'User Profile & Settings')
    .addTag('Accounts', 'Bank Accounts')
    .addTag('Transfers', 'All Transfer Types')
    .addTag('Transactions', 'Transaction History')
    .addTag('Cards', 'Virtual Cards')
    .addTag('Loans', 'Loans & Credit')
    .addTag('Investments', 'Stock Investments')
    .addTag('Bills', 'Bill Payments')
    .addTag('Crypto', 'Crypto Payments')
    .addTag('KYC', 'Identity Verification')
    .addTag('Receipts', 'Download Receipts')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`\n🏦 NexaBank API running → http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger Docs       → http://localhost:${port}/api/docs\n`);
}
bootstrap();
