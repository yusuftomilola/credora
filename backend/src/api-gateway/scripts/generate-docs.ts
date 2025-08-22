import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../../app.module';
import * as fs from 'fs';

async function generateApiDocs() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Credora API Gateway')
    .setDescription('Comprehensive API Gateway with rate limiting, analytics, and load balancing')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'ApiKeyAuth')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'BearerAuth')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
 
  fs.writeFileSync('./api-docs.json', JSON.stringify(document, null, 2));
  console.log('API documentation generated: api-docs.json');

  await app.close();
}

generateApiDocs().catch(console.error);
    