import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  process.env.AI_WORKER_ENABLED = 'true'
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] })
  app.enableShutdownHooks()
}

void bootstrap()
