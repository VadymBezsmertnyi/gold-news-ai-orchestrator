import { NestFactory } from '@nestjs/core';

// app
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`GoldNews API listening on http://localhost:${port}`);
}

void bootstrap();
