import 'reflect-metadata'

import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import cookie from '@fastify/cookie'

import { AppModule } from './app.module'
import { ApiExceptionFilter } from './common/api-exception.filter'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }))
  const config = app.get(ConfigService)
  const origins = config.get<string>('WEB_ORIGIN', 'http://127.0.0.1:5173').split(',').map((item) => item.trim())

  await app.register(cookie)
  app.enableCors({ origin: origins, credentials: true })
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new ApiExceptionFilter())

  const port = Number(config.get<string>('API_PORT', '3010'))
  await app.listen({ port, host: '127.0.0.1' })
}

void bootstrap()
