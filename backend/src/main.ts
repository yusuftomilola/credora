// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // capture raw body for webhook verification
  app.use(
    bodyParser.json({
      verify: (req: any, res, buf) => {
        // store raw body on request
        req.rawBody = buf.toString();
      },
    }),
  );

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
