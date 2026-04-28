import "reflect-metadata";
import { initSentry, Sentry } from "./sentry";
initSentry();

import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

bootstrap().catch((err) => {
  Sentry.captureException(err);
  console.error("Failed to start API", err);
  process.exit(1);
});
